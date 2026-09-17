/**
 * End-to-end check of the OCR pipeline composition — engine -> legibility refusal
 * -> dual-pass verification -> stats — using MockOcrEngine fixtures instead of a
 * live model call (no ANTHROPIC_API_KEY in this environment; see
 * lib/ingest/ocr-claude.ts's file-level comment).
 *
 * Mirrors app/api/taikyo/ocr/route.ts's own per-image sequence directly, the same
 * way tests/fixtures/webhook-check.ts mirrors its Shopify webhook routes — this
 * repo's routes use "@/" path aliases only Next's bundler resolves, so a
 * plain-node check composes the same underlying calls rather than importing the
 * route module. See that file for the fuller rationale.
 *
 *   npm run eval:ocr-route
 */

import { checkLegibility } from "../../lib/ingest/refusal.ts";
import { disagreementStats, verifyDualPass } from "../../lib/ingest/dual-pass.ts";
import { MockOcrEngine } from "../../lib/ingest/ocr-mock.ts";
import type { ImageInput, OcrResult } from "../../lib/ingest/ocr.ts";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    console.error(`  FAIL ${name}`);
    failures += 1;
  }
}

async function runOnePage(engine: MockOcrEngine, image: ImageInput) {
  const [passA, passB] = await Promise.all([engine.transcribe(image, "a"), engine.transcribe(image, "b")]);
  const refusal = checkLegibility(passA, passB);
  if (refusal) return { ok: false as const, refusal };
  const lines = verifyDualPass(passA, passB);
  return { ok: true as const, lines };
}

async function main() {
  const engine = new MockOcrEngine();

  // --- a clean, legible settlement statement --------------------------------
  const goodBytes = new Uint8Array(50_000);
  const goodResultA: OcrResult = {
    raw_text: "ハウスクリーニング費用 35,000円\n令和7年3月31日",
    lines: [
      { text: "ハウスクリーニング費用", bbox: { x: 0.1, y: 0.1, w: 0.4, h: 0.04 }, page: 1, field_class: "label", confidence: 0.95 },
      { text: "35,000円", bbox: { x: 0.6, y: 0.1, w: 0.2, h: 0.04 }, page: 1, field_class: "amount", confidence: 0.92 },
      { text: "令和7年3月31日", bbox: { x: 0.1, y: 0.3, w: 0.3, h: 0.04 }, page: 1, field_class: "date", confidence: 0.9 },
    ],
  };
  const goodResultB: OcrResult = {
    raw_text: "ハウスクリーニング費用 35,000円\n令和7年3月31日",
    lines: [
      { text: "ハウスクリーニング費用", bbox: { x: 0.1, y: 0.1, w: 0.4, h: 0.04 }, page: 1, field_class: "label", confidence: 0.9 },
      { text: "35,000円", bbox: { x: 0.6, y: 0.1, w: 0.2, h: 0.04 }, page: 1, field_class: "amount", confidence: 0.88 },
      { text: "令和7年3月31日", bbox: { x: 0.1, y: 0.3, w: 0.3, h: 0.04 }, page: 1, field_class: "date", confidence: 0.85 },
    ],
  };
  engine.registerFixture({ byteLength: goodBytes.length, passA: goodResultA, passB: goodResultB });

  const good = await runOnePage(engine, { bytes: goodBytes, mediaType: "image/jpeg", page: 1 });
  check("a legible page is not refused", good.ok);
  if (good.ok) {
    check("a legible page has no unresolved lines", good.lines.every((l) => l.status === "confirmed_auto"));
    const stats = disagreementStats(good.lines);
    check("a clean agreement has zero disagreement rate", stats.disagreementRate === 0);
  }

  // --- an unreadable / blank photo --------------------------------------------
  const blankBytes = new Uint8Array(9_999);
  const emptyResult: OcrResult = { raw_text: "", lines: [] };
  engine.registerFixture({ byteLength: blankBytes.length, passA: emptyResult, passB: emptyResult });
  const blank = await runOnePage(engine, { bytes: blankBytes, mediaType: "image/jpeg", page: 1 });
  check("a blank/unreadable photo is refused, not passed through as zero findings", !blank.ok);
  if (!blank.ok) check("refusal reason is empty_result", blank.refusal.reason === "empty_result");

  // --- a genuinely disputed figure survives into the response ------------------
  const disputedBytes = new Uint8Array(77_777);
  const bbox = { x: 0.2, y: 0.2, w: 0.3, h: 0.04 };
  const disputedA: OcrResult = {
    raw_text: "清掃費用 120,000円",
    lines: [
      { text: "清掃費用", bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 }, page: 1, field_class: "label", confidence: 0.9 },
      { text: "120,000円", bbox, page: 1, field_class: "amount", confidence: 0.7 },
    ],
  };
  const disputedB: OcrResult = {
    raw_text: "清掃費用 20,000円",
    lines: [
      { text: "清掃費用", bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 }, page: 1, field_class: "label", confidence: 0.9 },
      { text: "20,000円", bbox, page: 1, field_class: "amount", confidence: 0.65 },
    ],
  };
  engine.registerFixture({ byteLength: disputedBytes.length, passA: disputedA, passB: disputedB });
  const disputedPage = await runOnePage(engine, { bytes: disputedBytes, mediaType: "image/jpeg", page: 1 });
  check("a page with one disputed figure is still 'ok' (not refused)", disputedPage.ok);
  if (disputedPage.ok) {
    const dispute = disputedPage.lines.find((l) => l.field_class === "amount");
    check("the disputed amount is flagged, not silently resolved", dispute?.status === "disputed");
  }

  // --- MockOcrEngine refuses to invent a transcription for an unregistered image
  let threw = false;
  try {
    await engine.transcribe({ bytes: new Uint8Array(3), mediaType: "image/jpeg", page: 1 }, "a");
  } catch {
    threw = true;
  }
  check("MockOcrEngine throws rather than fabricating a result for an unknown fixture", threw);

  console.log(failures === 0 ? "\nOK" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
