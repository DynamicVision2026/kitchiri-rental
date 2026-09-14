/**
 * Golden-set validator for tests/golden-set/taikyo-corpus.json.
 *
 * Runs on stock Node (>=22.18) via native type stripping — no test runner and no
 * build step:  npm run validate:corpus
 *
 * It enforces four things:
 *   1. every entry satisfies the zod schema in lib/modules/taikyo/taxonomy.ts
 *   2. ids are unique and all 14 Tokuyaku patterns are represented
 *   3. every bandKey named in the taxonomy actually exists in bands.ts
 *   4. where the entry carries enough facts to compute a band, the recorded P3
 *      agrees with what bands.ts says — so a hand-written expectation cannot drift
 *      away from the thresholds it is supposed to encode
 */

import {
  TOKUYAKU_CODES,
  TOKUYAKU_PATTERNS,
  corpusSchema,
  type CorpusEntry,
  type TokuyakuCode,
} from "../../lib/modules/taikyo/taxonomy.ts";
import {
  BAND_REGISTRY,
  CLEANING_BANDS_BY_LAYOUT,
  KAGI_BAND,
  SHOUDOKU_BAND,
  evaluateAgainst,
  evaluateCleaning,
  evaluateShikibiki,
  evaluateTankiKaiyaku,
  type BandResult,
} from "../../lib/modules/taikyo/bands.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const corpusPath = fileURLToPath(new URL("./taikyo-corpus.json", import.meta.url));
const failures: string[] = [];
const notes: string[] = [];

/* 1. schema ------------------------------------------------------------- */

const parsed = corpusSchema.safeParse(JSON.parse(readFileSync(corpusPath, "utf8")));
if (!parsed.success) {
  for (const issue of parsed.error.issues) {
    failures.push(`schema: ${issue.path.join(".")} — ${issue.message}`);
  }
  report();
  process.exit(1);
}
const corpus = parsed.data;

/* 2. ids and coverage --------------------------------------------------- */

const seen = new Set<string>();
for (const entry of corpus.cases) {
  if (seen.has(entry.id)) failures.push(`duplicate id ${entry.id}`);
  seen.add(entry.id);
}

const covered = new Set<TokuyakuCode>(corpus.cases.map((c) => c.expected_code));
for (const code of TOKUYAKU_CODES) {
  if (!covered.has(code)) failures.push(`no corpus entry exercises ${code}`);
}

/* 3. taxonomy bandKeys resolve ------------------------------------------ */

for (const code of TOKUYAKU_CODES) {
  const key = TOKUYAKU_PATTERNS[code].bandKey;
  if (key !== null && !(key in BAND_REGISTRY)) {
    failures.push(`${code} names bandKey "${key}", which bands.ts does not define`);
  }
}

/* 4. recorded P3 vs computed band --------------------------------------- */

/** Returns null when the entry lacks the facts needed to place it in a band. */
function computeBand(entry: CorpusEntry): BandResult | null {
  const { charged_amount_jpy: charged, rent_monthly_jpy: rent, layout } = entry.context;
  if (charged === null) return null;

  switch (entry.expected_code) {
    case "TK_SHIKIBIKI":
    case "TK_SHOUKYAKU":
      return rent ? evaluateShikibiki(charged, rent) : null;
    case "TK_TANKI":
      return rent ? evaluateTankiKaiyaku(charged, rent) : null;
    case "TK_CLEAN":
      return layout && layout in CLEANING_BANDS_BY_LAYOUT
        ? evaluateCleaning(charged, { layout })
        : null;
    case "TK_KAGI":
      return evaluateAgainst(KAGI_BAND, charged);
    case "TK_SHOUDOKU":
      return evaluateAgainst(SHOUDOKU_BAND, charged);
    default:
      // Per-unit bands (cross, tatami, flooring) need a unit count the corpus
      // context does not yet carry. Tracked as a schema gap, not a failure.
      return null;
  }
}

let checked = 0;
for (const entry of corpus.cases) {
  const band = computeBand(entry);
  if (band === null || band.level === "not_computable") continue;
  checked += 1;
  const expectedP3 = band.level !== "excessive";
  if (entry.expected_prongs.P3 !== expectedP3) {
    failures.push(
      `${entry.id} (${entry.expected_code}): P3 recorded ${entry.expected_prongs.P3}, ` +
        `but ${band.measured?.toFixed(2)} ${band.key} is "${band.level}" ` +
        `(supported<=${band.supportedMax}, elevated<=${band.elevatedMax}) so P3 should be ${expectedP3}`,
    );
  }
}

/* provenance accounting -------------------------------------------------- */

const unverified = corpus.cases.filter((c) => !c.source.verified).length;
const verbatim = corpus.cases.filter((c) => c.clause_text_provenance === "verbatim_field_sample").length;
notes.push(`${corpus.cases.length}/${corpus.target_size} entries; all 14 patterns covered`);
notes.push(`${checked} entries had computable bands and agree with bands.ts`);
notes.push(`${unverified} entries carry an UNVERIFIED source citation — human check required`);
notes.push(`${verbatim} entries are verbatim field samples`);

function report(): void {
  for (const n of notes) console.log(`  note: ${n}`);
  for (const f of failures) console.error(`  FAIL: ${f}`);
}

console.log("taikyo golden-set validation");
report();
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nOK");
