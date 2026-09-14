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
  if (entry.context === null) return null;
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
  if (entry.expected_prongs.P3 === "unknown") continue;
  const expectedP3 = band.level !== "excessive";
  if (entry.expected_prongs.P3 !== expectedP3) {
    failures.push(
      `${entry.id} (${entry.expected_code}): P3 recorded ${entry.expected_prongs.P3}, ` +
        `but ${band.measured?.toFixed(2)} ${band.key} is "${band.level}" ` +
        `(supported<=${band.supportedMax}, elevated<=${band.elevatedMax}) so P3 should be ${expectedP3}`,
    );
  }
}

/* 5. clause_text must be a clause ---------------------------------------- */

const QUESTION = /(ですか|ますか|でしょうか)[？?]/;
for (const entry of corpus.cases) {
  if (QUESTION.test(entry.clause_text)) {
    failures.push(
      `${entry.id}: clause_text reads as a tenant's question, not lease language. ` +
        `A golden set keyed on clause wording cannot carry a narrative here — ` +
        `replace it with the clause the enquiry is about, or move the entry to a separate intake fixture.`,
    );
  }
}

/* 6. provenance may not overclaim ---------------------------------------- */

const ARCHETYPE = /型/;
for (const entry of corpus.cases) {
  if (entry.clause_text_provenance === "verbatim_field_sample" && ARCHETYPE.test(entry.source.reference)) {
    failures.push(
      `${entry.id}: marked verbatim_field_sample but the source describes a 類型/型 (an archetype). ` +
        `An archetype cannot also be a verbatim transcription — downgrade the provenance or cite the document.`,
    );
  }
}

/* 7. internal consistency on the art. 621 question ------------------------ */

/**
 * Clauses that disclaim depreciation or occupancy length are the paradigm P4
 * question. Two such clauses under the SAME pattern code cannot be ground truth
 * with opposite P4 scores — whichever way the law comes out, the corpus has to
 * pick one, or the engine is being trained against itself.
 */
const DISCLAIMS_DEPRECIATION =
  /(経過年数|耐用年数|経年|居住年数|居住期間|入居期間|使用年数|損耗の程度|使用状況).{0,12}(かかわらず|関わらず|問わず|考慮せず|考慮しない)/;

const byCode = new Map<TokuyakuCode, CorpusEntry[]>();
for (const entry of corpus.cases) {
  if (!DISCLAIMS_DEPRECIATION.test(entry.clause_text)) continue;
  const bucket = byCode.get(entry.expected_code) ?? [];
  bucket.push(entry);
  byCode.set(entry.expected_code, bucket);
}
for (const [code, entries] of byCode) {
  const upheld = entries.filter((e) => e.expected_prongs.P4 === true);
  const struck = entries.filter((e) => e.expected_prongs.P4 === false);
  if (upheld.length > 0 && struck.length > 0) {
    failures.push(
      `${code}: contradictory ground truth on the art. 621 override. ` +
        `${upheld.map((e) => e.id).join(", ")} score P4 true while ` +
        `${struck.map((e) => e.id).join(", ")} score P4 false, but all of them disclaim ` +
        `depreciation or occupancy length. One side has to change.`,
    );
  }
}

/* provenance accounting -------------------------------------------------- */

const unverified = corpus.cases.filter((c) => !c.source.verified).length;
const verbatim = corpus.cases.filter((c) => c.clause_text_provenance === "verbatim_field_sample").length;
notes.push(`${corpus.cases.length}/${corpus.target_size} entries; all 14 patterns covered`);
notes.push(`${checked} entries had computable bands and agree with bands.ts`);
const noContext = corpus.cases.filter(
  (c) => c.context === null && TOKUYAKU_PATTERNS[c.expected_code].bandKey !== null,
).length;
notes.push(`${noContext} entries name a numeric pattern but carry no context — their P3 cannot be rechecked`);
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
