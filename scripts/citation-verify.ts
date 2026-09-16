/**
 * Citation verification CLI — sign off one authority at a time.
 *
 *   npm run audit:status
 *   npm run audit:verify -- --group "<key>" --status <level> --evidence "<what you read>"
 *   npm run audit:verify -- --group "<key>" --status <level> --evidence "..." --apply
 *
 * `--status` is REQUIRED and has no default. `primary` / `primary_source_verified`
 * and `secondary` / `secondary_source_checked` are accepted (the short forms are
 * aliases, not a separate level) and are not interchangeable — which one you are
 * claiming should be a decision you typed, not a default you inherited:
 *
 *   secondary_source_checked — cross-read against reputable secondary summaries.
 *     Enough to catch a misattribution; NOT enough to put a number in front of a
 *     tenant. Leaves `verified` false.
 *   primary_source_verified — you read the primary text itself (民集, the guideline
 *     PDF, the RETIO issue). Only this sets `verified: true`, and ONLY when backed
 *     by a `legal/` file reference and a quoted passage — see below.
 *
 * PRIMARY CLAIMS ARE BACKED BY A FILE, NOT JUST A SENTENCE OF EVIDENCE
 * ---------------------------------------------------------------------
 * `--status primary` additionally requires `--legal-id <id>` and `--quote "<exact
 * passage>"`. The id must name an entry in `legal/manifest.json`, and the quoted
 * passage must appear verbatim in that entry's `legal/texts/*.md` file — checked
 * programmatically, not taken on trust. This is what "backed by file references and
 * quoted passages" means in practice: a primary claim without a corresponding bundled
 * text and an exact quotation from it is refused before `--apply` ever runs.
 * `--status secondary` does not require this — the whole legal/ corpus is currently
 * at `secondary_source_checked` or below (see `npm run audit:status`), and this CLI
 * should not make that easier to skip past by accident.
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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CORPUS_PATH, OPEN_QUESTIONS, groupCorpus, readCorpus } from "./lib/citation-groups.ts";
import { LEGAL_DIR, MANIFEST_PATH, regenerateLegalManifest, updateLegalVerification } from "./lib/legal-manifest.ts";

interface LegalManifestEntry {
  id: string;
  file: string;
  citation_group_key: string;
}

function readLegalManifest(): LegalManifestEntry[] {
  if (!existsSync(MANIFEST_PATH)) return [];
  return (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).entries ?? []) as LegalManifestEntry[];
}

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
  console.log('    npm run audit:verify -- --group "<authority>" --status secondary --evidence "<what you read>" --apply');
  console.log(
    '    npm run audit:verify -- --group "<authority>" --status primary --legal-id <id> --quote "<passage>" --evidence "..." --apply',
  );
  console.log(`    legal/ corpus: ${readLegalManifest().length} bundled source files — see legal/manifest.json`);
}

if (has("list") || (!arg("group") && !has("apply"))) {
  board();
  process.exit(0);
}

const key = arg("group");
const evidence = arg("evidence");
const statusArg = arg("status");
const apply = has("apply");

const LEVELS = ["secondary_source_checked", "primary_source_verified"] as const;
type Level = (typeof LEVELS)[number];

/** Short forms accepted alongside the full level names — aliases, not a third level. */
const STATUS_ALIASES: Record<string, Level> = {
  primary: "primary_source_verified",
  primary_source_verified: "primary_source_verified",
  secondary: "secondary_source_checked",
  secondary_source_checked: "secondary_source_checked",
};

if (!statusArg || !(statusArg in STATUS_ALIASES)) {
  console.error(
    `Missing or unknown --status.\n` +
      `  --status secondary   (or secondary_source_checked)   cross-read against secondary summaries (verified stays false)\n` +
      `  --status primary     (or primary_source_verified)    you read the primary text AND can name the legal/ file and\n` +
      `                                                        quote the passage that backs it (sets verified: true)\n` +
      `There is no default: claiming primary verification should be something you typed.`,
  );
  process.exit(1);
}
const level = STATUS_ALIASES[statusArg];

/*
 * A primary claim must be backed by a bundled legal/ file and an exact quotation
 * from it — checked here, not taken on the strength of --evidence text alone.
 */
let verifiedLegalId: string | null = null;
if (level === "primary_source_verified") {
  const legalId = arg("legal-id");
  const quote = arg("quote");
  const manifest = readLegalManifest();

  if (manifest.length === 0) {
    console.error(
      "No legal/manifest.json found (or it has no entries).\n" +
        "A primary_source_verified claim needs a bundled source file to point at — see legal/README.md.",
    );
    process.exit(1);
  }
  if (!legalId) {
    console.error(
      "Missing --legal-id.\n" +
        "primary_source_verified must name the legal/ corpus entry it is backed by.\n" +
        `Known ids: ${manifest.map((e) => e.id).join(", ")}`,
    );
    process.exit(1);
  }
  const entry = manifest.find((e) => e.id === legalId);
  if (!entry) {
    console.error(`No legal/ entry with id "${legalId}".\nKnown ids: ${manifest.map((e) => e.id).join(", ")}`);
    process.exit(1);
  }
  if (!quote || quote.trim().length < 8) {
    console.error(
      "Missing --quote, or too short.\n" +
        `Quote the exact passage in ${entry.file} that supports this sign-off — it is checked\n` +
        "against the file's actual contents, not taken on trust.",
    );
    process.exit(1);
  }
  const filePath = `${LEGAL_DIR}${entry.file}`;
  if (!existsSync(filePath)) {
    console.error(`legal/manifest.json points "${legalId}" at ${entry.file}, which does not exist.`);
    process.exit(1);
  }
  const fileText = readFileSync(filePath, "utf8");
  // The bundled .md files hard-wrap long quoted passages across multiple `> ` lines
  // for readability, and a genuine verbatim substring can straddle one of those
  // wraps. Strip markdown blockquote markers and collapse all whitespace (including
  // the wrap-inserted newlines) before comparing, on both sides, so the check tests
  // for the actual characters in sequence — not for our own manual line-wrapping.
  const normalize = (s: string) => s.replace(/^>\s?/gm, "").replace(/\s+/g, "");
  if (!normalize(fileText).includes(normalize(quote))) {
    console.error(
      `The --quote text does not appear verbatim in ${entry.file}.\n` +
        "primary_source_verified is refused: either the quote has a typo, or it is not actually in the bundled text\n" +
        "(in which case the file needs updating BEFORE this claim can be made, not after).",
    );
    process.exit(1);
  }
  console.log(`  legal/ backing: ${entry.file}  [${entry.citation_group_key}]`);
  console.log(`  quoted passage confirmed present in the file.`);
  verifiedLegalId = legalId;
}

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
if (level === "secondary_source_checked" && questions.length > 0) {
  console.log("  NOTE: a secondary cross-read does NOT settle the open questions below.");
  console.log("        They stay on the checklist until someone reads the primary text.");
}
console.log(`${apply ? "Applying" : "DRY RUN"} — ${key}  [${level}]`);
console.log(`  where: ${group.where}`);
if (questions.length && level === "primary_source_verified") {
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
  if (before === "primary_source_verified" && level === "secondary_source_checked") {
    console.log(`    ${entry.id}  already primary_source_verified — left alone (never downgrade)`);
    continue;
  }
  console.log(`    ${entry.id}  ${before} -> ${level}`);
  if (!apply) continue;
  entry.source.verification_status = level;
  entry.source.verified = level === "primary_source_verified";
  const note = level === "primary_source_verified"
    ? `Primary source verified ${stamp}. Evidence: ${evidence}`
    : `Cross-read against secondary sources ${stamp} — NOT primary-source verified. Evidence: ${evidence}`;
  entry.source.note = entry.source.note ? `${entry.source.note} ${note}` : note;
}

if (!apply) {
  console.log("\nNothing written. Re-run with --apply to commit these changes.");
  process.exit(0);
}

writeFileSync(CORPUS_PATH, `${JSON.stringify(corpus, null, 2)}\n`);
console.log(`\nWrote ${group.entries.length} entries.`);

// A primary claim moves the legal/ source file's own frontmatter in the same
// operation, then regenerates the manifest — corpus and legal/ never drift apart,
// because there is no window where one is updated and the other is not.
if (verifiedLegalId) {
  const file = updateLegalVerification(verifiedLegalId, "primary_source_verified", true);
  regenerateLegalManifest();
  console.log(`Updated legal/texts/${file} and regenerated legal/manifest.json.`);
}

console.log("Now run:  npm run validate:corpus && npm run audit:citations");
