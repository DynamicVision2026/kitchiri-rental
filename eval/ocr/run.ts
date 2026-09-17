/**
 * V16 Task 4 — accuracy gates on Batches 1 and 2.
 *
 * Refuses to run, loudly, if the batches this ticket asks for don't exist — see
 * eval/ocr/README.md, which explains exactly what was and wasn't checked. This
 * script does not simulate, estimate, or otherwise invent an accuracy number in
 * their absence; that would be worse than reporting nothing, on a ticket whose
 * entire premise is that an unmeasured number is a liability.
 *
 *   npm run eval:ocr-accuracy
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfiguredOcrEngine } from "../../lib/ingest/engine-select.ts";
import { checkLegibility } from "../../lib/ingest/refusal.ts";
import { disagreementStats, verifyDualPass, type VerifiedLine } from "../../lib/ingest/dual-pass.ts";
import { accuracyByFieldClass, ACCURACY_GATES, gateResult, matchToGroundTruth, type GroundTruthSample } from "./scoring.ts";
import type { ImageInput } from "../../lib/ingest/ocr.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BATCHES = ["batch-1", "batch-2"];
const IMAGE_EXT: Record<string, ImageInput["mediaType"]> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

interface Sample {
  id: string;
  imagePath: string;
  mediaType: ImageInput["mediaType"];
  groundTruth: GroundTruthSample;
}

function discoverBatch(batchDir: string): Sample[] | null {
  if (!existsSync(batchDir)) return null;
  const files = readdirSync(batchDir);
  const samples: Sample[] = [];
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const mediaType = IMAGE_EXT[ext];
    if (!mediaType) continue;
    const id = f.slice(0, -ext.length);
    const jsonPath = join(batchDir, `${id}.json`);
    if (!existsSync(jsonPath)) {
      console.error(`  MISSING GROUND TRUTH: ${join(batchDir, f)} has no matching ${id}.json — refusing to eyeball it.`);
      continue;
    }
    const groundTruth = JSON.parse(readFileSync(jsonPath, "utf8")) as GroundTruthSample;
    // Filename-derived id wins over anything the JSON itself might carry — the
    // filename is the authoritative sample identity.
    samples.push({ id, imagePath: join(batchDir, f), mediaType, groundTruth: { ...groundTruth, id } });
  }
  return samples;
}

async function runBatch(name: string, samples: Sample[]) {
  const engine = getConfiguredOcrEngine();
  console.log(`\n=== ${name} — ${samples.length} sample(s), engine: ${engine.id} ===`);

  let refusedCount = 0;
  const allMatches: ReturnType<typeof matchToGroundTruth> = [];
  const allVerified: VerifiedLine[] = [];
  let totalCorrections = 0;

  for (const sample of samples) {
    const bytes = new Uint8Array(readFileSync(sample.imagePath));
    const image: ImageInput = { bytes, mediaType: sample.mediaType, page: 1 };
    const [passA, passB] = await Promise.all([engine.transcribe(image, "a"), engine.transcribe(image, "b")]);

    const refusal = checkLegibility(passA, passB);
    if (refusal) {
      refusedCount += 1;
      console.log(`  ${sample.id}: REFUSED (${refusal.reason})`);
      continue;
    }

    const verified = verifyDualPass(passA, passB);
    allVerified.push(...verified);
    totalCorrections += verified.filter((l) => l.status === "disputed" || l.status === "missing").length;

    allMatches.push(...matchToGroundTruth(verified, sample.groundTruth));
  }

  const stats = disagreementStats(allVerified);
  const acc = accuracyByFieldClass(allMatches);

  console.log(`  refusal rate: ${((refusedCount / samples.length) * 100).toFixed(1)}% (${refusedCount}/${samples.length})`);
  console.log(`  amount/date disagreement rate: ${(stats.disagreementRate * 100).toFixed(1)}% (${stats.disputed} disputed / ${stats.totalBlockingFields - stats.missing} comparable)`);
  console.log(`  mean corrections per document: ${(totalCorrections / Math.max(1, samples.length - refusedCount)).toFixed(2)}`);
  console.log(`\n  ${"field".padEnd(8)}${"n".padEnd(6)}${"pre-confirm".padEnd(14)}${"post-confirm".padEnd(14)}${"gate".padEnd(8)}result`);
  for (const a of acc) {
    const gate = ACCURACY_GATES[a.field_class];
    const result = gateResult(a);
    console.log(
      `  ${a.field_class.padEnd(8)}${String(a.total).padEnd(6)}` +
      `${(a.preConfirmationRate * 100).toFixed(1).padEnd(14)}${(a.postConfirmationRate * 100).toFixed(1).padEnd(14)}` +
      `${(gate !== null ? `${(gate * 100).toFixed(0)}%` : "—").padEnd(8)}${result === "pass" ? "PASS" : result === "fail" ? "FAIL <-- BLOCKS LAUNCH" : "(not gated)"}`,
    );
  }
}

async function main() {
  const missing: string[] = [];
  const found: { name: string; samples: Sample[] }[] = [];

  for (const b of BATCHES) {
    const dir = join(HERE, b);
    const samples = discoverBatch(dir);
    if (samples === null) missing.push(b);
    else found.push({ name: b, samples });
  }

  if (missing.length === BATCHES.length) {
    console.error(
      "\nNo ground-truth batches found under eval/ocr/. Neither batch-1/ nor batch-2/ exists.\n" +
      "Per the V16 ticket: \"Batches 1 and 2 must be committed to eval/ocr/ with ground-truth\n" +
      "JSON per sample. I have not seen these files; confirm they are in the repo before\n" +
      "starting.\" They are not in this repo. See eval/ocr/README.md for the expected layout\n" +
      "and exactly what this session could and could not verify without them.\n",
    );
    process.exit(1);
  }

  if (missing.length > 0) {
    console.warn(`\nWARNING: missing ${missing.join(", ")} — reporting only what exists (${found.map((f) => f.name).join(", ")}).`);
  }

  let engineOk = true;
  try {
    getConfiguredOcrEngine();
  } catch (e) {
    console.error(`\nNo OCR engine configured: ${e instanceof Error ? e.message : String(e)}`);
    engineOk = false;
  }
  if (!engineOk) process.exit(1);

  for (const { name, samples } of found) {
    if (samples.length === 0) {
      console.warn(`\n${name}/ exists but has no valid (image, ground-truth) pairs.`);
      continue;
    }
    await runBatch(name, samples);
  }
}

void main();
