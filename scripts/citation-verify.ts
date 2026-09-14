/**
 * Citation verification CLI — sign off one authority at a time.
 *
 *   npm run audit:status                         # progress board
 *   npm run audit:verify -- --group "<key>" --evidence "<what you read>"
 *   npm run audit:verify -- --group "<key>" --evidence "..." --apply
 *
 * Why a CLI: an authority backs up to 17 entries, and clearing it by hand means 17
 * identical JSON edits with 17 chances to set `verified: true` on the wrong one. This
 * does the whole group atomically, refuses to run without evidence, and is dry by
 * default so you see the diff before anything is written.
 *
 * It cannot invent verification. It records that a HUMAN read the primary text, which
 * is exactly what `verified: true` is supposed to mean and the only thing that makes
 * the flag worth having.
 */

import { writeFileSync } from "node:fs";
import { CORPUS_PATH, OPEN_QUESTIONS, groupCorpus, readCorpus } from "./lib/citation-groups.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const corpus = readCorpus();
const { groups, syntheticCount } = groupCorpus(corpus);
const totalExternal = groups.reduce((n, g) => n + g.entries.length, 0);
const totalVerified = groups.reduce((n, g) => n + g.verified, 0);

function bar(done: number, total: number, width = 18): string {
  const filled = total === 0 ? width : Math.round((done / total) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

/** Display width: CJK and full-width punctuation occupy two terminal columns. */
function width(text: string): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    w += (c >= 0x1100 && (c <= 0x115f || c === 0x2329 || c === 0x232a ||
      (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6))) ? 2 : 1;
  }
  return w;
}

function padDisplay(text: string, target: number): string {
  let out = "";
  let w = 0;
  for (const ch of text) {
    const cw = width(ch);
    if (w + cw > target) break;
    out += ch;
    w += cw;
  }
  return out + " ".repeat(Math.max(0, target - w));
}

function board(): void {
  console.log(`citation audit status — corpus v${corpus.version}\n`);
  console.log(`  ${bar(totalVerified, totalExternal)}  ${totalVerified}/${totalExternal} entries primary-source verified`);
  console.log(`  ${syntheticCount} of our own fixtures assert no judgment and need nothing.\n`);
  console.log(`  ${padDisplay("authority", 46)}  entries  verified  open questions`);
  console.log(`  ${"-".repeat(84)}`);
  for (const g of groups) {
    const q = OPEN_QUESTIONS[g.key]?.length ?? 0;
    const flag = g.verified === g.entries.length ? "✔" : g.secondary > 0 ? "~" : " ";
    console.log(
      `  ${flag} ${padDisplay(g.key, 46)}  ${String(g.entries.length).padStart(5)}  ${String(g.verified).padStart(8)}  ${q > 0 ? `${q} to settle` : "-"}`,
    );
  }
  console.log("\n  ✔ cleared   ~ cross-read against secondary sources only, still unverified");
  console.log("\n  Clear one with:");
  console.log('    npm run audit:verify -- --group "<authority>" --evidence "<what you read>" --apply');
}

if (has("list") || (!arg("group") && !has("apply"))) {
  board();
  process.exit(0);
}

const key = arg("group");
const evidence = arg("evidence");
const apply = has("apply");

if (!key) { console.error('Missing --group. Run with --list to see the authorities.'); process.exit(1); }
const group = groups.find((g) => g.key === key);
if (!group) {
  console.error(`No authority named "${key}".\nKnown authorities:`);
  for (const g of groups) console.error(`  ${g.key}`);
  process.exit(1);
}
if (!evidence || evidence.trim().length < 12) {
  console.error(
    "Missing --evidence, or too short.\n" +
      "Record what you actually read — reporter and page, or the URL of the PDF. The flag is\n" +
      "worthless if it can be set without saying what was checked.",
  );
  process.exit(1);
}

const questions = OPEN_QUESTIONS[key] ?? [];
console.log(`${apply ? "Applying" : "DRY RUN"} — ${key}`);
console.log(`  where: ${group.where}`);
if (questions.length) {
  console.log("  open questions this sign-off asserts are settled:");
  for (const q of questions) console.log(`    - ${q}`);
}
console.log(`  evidence: ${evidence}`);
console.log(`  entries (${group.entries.length}):`);

const stamp = new Date().toISOString().slice(0, 10);
const ids = new Set(group.entries.map((e) => e.id));
for (const entry of corpus.cases) {
  if (!ids.has(entry.id)) continue;
  const before = entry.source.verification_status;
  console.log(`    ${entry.id}  ${before} -> primary_source_verified`);
  if (!apply) continue;
  entry.source.verification_status = "primary_source_verified";
  entry.source.verified = true;
  const note = `Primary source verified ${stamp}. Evidence: ${evidence}`;
  entry.source.note = entry.source.note ? `${entry.source.note} ${note}` : note;
}

if (!apply) {
  console.log("\nNothing written. Re-run with --apply to commit these changes.");
  process.exit(0);
}

writeFileSync(CORPUS_PATH, `${JSON.stringify(corpus, null, 2)}\n`);
console.log(`\nWrote ${group.entries.length} entries.`);
console.log("Now run:  npm run validate:corpus && npm run audit:citations");
