/**
 * Behavioural check for dual-pass numeral verification (V16 Task 2). Pure logic,
 * no OCR engine needed — every OcrResult here is a hand-built fixture.
 *
 *   npm run eval:dual-pass
 */

import {
  disagreementStats, hasUnresolvedLines, normaliseAmount, normaliseDate,
  resolveLine, verifyDualPass,
} from "../../lib/ingest/dual-pass.ts";
import type { OcrLine, OcrResult } from "../../lib/ingest/ocr.ts";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    console.error(`  FAIL ${name}`);
    failures += 1;
  }
}

function line(over: Partial<OcrLine>): OcrLine {
  return {
    text: "", bbox: { x: 0, y: 0, w: 0.2, h: 0.05 }, page: 1,
    field_class: "other", confidence: 0.9, ...over,
  };
}
function result(lines: OcrLine[]): OcrResult {
  return { lines, raw_text: lines.map((l) => l.text).join("\n") };
}

// --- normalisation -----------------------------------------------------
check("normaliseAmount strips 金/円/commas", normaliseAmount("金120,000円") === "120000");
check("normaliseAmount folds full-width digits", normaliseAmount("１２０，０００円") === "120000");
check("normaliseAmount catches a real misread (120,000 vs 20,000)", normaliseAmount("金120,000円") !== normaliseAmount("金20,000円"));
check("normaliseDate folds era name + digits, zero-padded", normaliseDate("令和7年4月1日") === "R70401");
check("normaliseDate ignores separator style", normaliseDate("2026-04-01") === normaliseDate("2026年4月1日"));

// --- pairing + agreement -------------------------------------------------
{
  const bbox = { x: 0.1, y: 0.2, w: 0.3, h: 0.04 };
  const passA = result([
    line({ text: "金120,000円", field_class: "amount", bbox, page: 1, confidence: 0.95 }),
  ]);
  const passB = result([
    line({ text: "120,000円", field_class: "amount", bbox, page: 1, confidence: 0.9 }),
  ]);
  const verified = verifyDualPass(passA, passB);
  check("agreeing amount is confirmed_auto", verified.length === 1 && verified[0].status === "confirmed_auto");
  check("confirmed amount carries a resolved_text", verified[0].resolved_text === "金120,000円");
  check("no unresolved lines once everything agrees", !hasUnresolvedLines(verified));
}

// --- the exact failure the ticket names: 120,000 read as 20,000 --------
{
  const bbox = { x: 0.1, y: 0.2, w: 0.3, h: 0.04 };
  const passA = result([line({ text: "金120,000円", field_class: "amount", bbox, confidence: 0.9 })]);
  const passB = result([line({ text: "金20,000円", field_class: "amount", bbox, confidence: 0.85 })]);
  const verified = verifyDualPass(passA, passB);
  check("disagreeing amount is disputed, not silently resolved", verified[0].status === "disputed");
  check("a disputed amount has no resolved_text — no default to either pass", verified[0].resolved_text === null);
  check("a disputed line blocks analysis", hasUnresolvedLines(verified));

  // higher confidence must NOT win by default
  const passAHighConf = result([line({ text: "金120,000円", field_class: "amount", bbox, confidence: 0.99 })]);
  const passBLowConf = result([line({ text: "金20,000円", field_class: "amount", bbox, confidence: 0.4 })]);
  const verified2 = verifyDualPass(passAHighConf, passBLowConf);
  check("confidence gap does not resolve a dispute", verified2[0].status === "disputed" && verified2[0].resolved_text === null);

  // user resolves it
  const resolved = resolveLine(verified[0], "120,000円");
  check("resolveLine clears the dispute and records the correction", resolved.status === "confirmed_auto" && resolved.user_corrected && resolved.resolved_text === "120,000円");
  check("resolving the only disputed line clears the block", !hasUnresolvedLines([resolved]));
}

// --- missing from one pass ----------------------------------------------
{
  const passA = result([line({ text: "令和7年3月31日", field_class: "date", bbox: { x: 0.1, y: 0.5, w: 0.3, h: 0.04 } })]);
  const passB = result([]); // second pass found nothing at all
  const verified = verifyDualPass(passA, passB);
  check("a field only one pass found is missing, not confirmed", verified.length === 1 && verified[0].status === "missing");
  check("missing forces user entry (blocks)", hasUnresolvedLines(verified));
}

// --- non-blocking classes (name/label/other) pass through untouched -----
{
  const bbox = { x: 0.1, y: 0.3, w: 0.3, h: 0.04 };
  const passA = result([line({ text: "山田太郎", field_class: "name", bbox })]);
  const passB = result([line({ text: "山田次郎", field_class: "name", bbox })]); // disagreement, but non-blocking
  const verified = verifyDualPass(passA, passB);
  check("a name disagreement does not dispute or block", verified[0].status === "confirmed_auto");
  check("non-blocking classes are never in hasUnresolvedLines", !hasUnresolvedLines(verified));
}

// --- disagreement stats ---------------------------------------------------
{
  const bboxAmt = { x: 0.1, y: 0.1, w: 0.3, h: 0.04 };
  const bboxDate = { x: 0.1, y: 0.2, w: 0.3, h: 0.04 };
  const bboxAmt2 = { x: 0.1, y: 0.3, w: 0.3, h: 0.04 };
  const passA = result([
    line({ text: "120,000円", field_class: "amount", bbox: bboxAmt }),
    line({ text: "令和7年3月31日", field_class: "date", bbox: bboxDate }),
    line({ text: "35,000円", field_class: "amount", bbox: bboxAmt2 }),
  ]);
  const passB = result([
    line({ text: "120,000円", field_class: "amount", bbox: bboxAmt }), // agrees
    line({ text: "令和7年3月30日", field_class: "date", bbox: bboxDate }), // disagrees
    line({ text: "35,000円", field_class: "amount", bbox: bboxAmt2 }), // agrees
  ]);
  const verified = verifyDualPass(passA, passB);
  const stats = disagreementStats(verified);
  check("disagreement stats count only blocking classes", stats.totalBlockingFields === 3);
  check("disagreement stats found the one real dispute", stats.disputed === 1);
  check("disagreement rate is 1/3", Math.abs(stats.disagreementRate - 1 / 3) < 1e-9);
}

// --- pairing survives passes returning lines in a different order -------
{
  const bboxA = { x: 0.1, y: 0.1, w: 0.3, h: 0.04 };
  const bboxB = { x: 0.1, y: 0.4, w: 0.3, h: 0.04 };
  const passA = result([
    line({ text: "60,000円", field_class: "amount", bbox: bboxA }),
    line({ text: "10,000円", field_class: "amount", bbox: bboxB }),
  ]);
  // pass B returns the SAME two fields in reverse order — pairing is by bbox
  // overlap, not by array index, so this must still match correctly.
  const passB = result([
    line({ text: "10,000円", field_class: "amount", bbox: bboxB }),
    line({ text: "60,000円", field_class: "amount", bbox: bboxA }),
  ]);
  const verified = verifyDualPass(passA, passB);
  check("bbox-based pairing is order-independent", verified.every((l) => l.status === "confirmed_auto"));
}

console.log(failures === 0 ? "\nOK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
