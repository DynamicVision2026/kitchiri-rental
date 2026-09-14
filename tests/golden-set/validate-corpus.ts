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
  CROSS_BAND_PER_SQM,
  FLOORING_BAND_PER_SQM,
  TATAMI_BAND_PER_MAT,
  evaluateAgainst,
  evaluateCleaning,
  evaluateKoshinryo,
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
  const unitPrice = entry.context.unit_price_jpy ?? null;
  if (charged === null && unitPrice === null) return null;

  switch (entry.expected_code) {
    case "TK_SHIKIBIKI":
    case "TK_SHOUKYAKU":
      return rent && charged !== null ? evaluateShikibiki(charged, rent) : null;
    case "TK_TANKI":
      return rent && charged !== null ? evaluateTankiKaiyaku(charged, rent) : null;
    case "TK_CLEAN":
      return charged !== null && layout && layout in CLEANING_BANDS_BY_LAYOUT
        ? evaluateCleaning(charged, { layout })
        : null;
    case "TK_KAGI":
      return evaluateAgainst(KAGI_BAND, charged);
    case "TK_SHOUDOKU":
      return evaluateAgainst(SHOUDOKU_BAND, charged);
    case "TK_KOSHIN": {
      const years = entry.context.renewal_interval_years ?? null;
      return rent && years && charged !== null ? evaluateKoshinryo(charged, rent, years) : null;
    }
    // Per-unit patterns are scored on the unit price the clause states, not on the
    // billed total: a large bill for a large room is not disproportionate.
    case "TK_TATAMI":
      return unitPrice === null ? null : evaluateAgainst(TATAMI_BAND_PER_MAT, unitPrice);
    case "TK_CROSS":
      return unitPrice === null ? null : evaluateAgainst(CROSS_BAND_PER_SQM, unitPrice);
    case "TK_FLOOR":
      return unitPrice === null ? null : evaluateAgainst(FLOORING_BAND_PER_SQM, unitPrice);
    default:
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

/* 7. the 最判平成17年12月16日 rule, applied uniformly -------------------- */

/**
 * A clause that shifts cost "irrespective of" occupancy length, age, or degree of
 * wear takes aim at the art. 621 default. Under 最判平成17年12月16日 such a clause can
 * still bind, but only where the tenant was put on notice and assented — so P4 may
 * be true only when the clause itself records an explanation or the tenant's assent.
 *
 * This bites only for depreciation-sensitive patterns. A flat cleaning or key-change
 * fee may say "regardless of period of occupancy" harmlessly: neither item carries a
 * useful life, so there is no 経過年数 protection to disclaim.
 */
const DISCLAIMS =
  /(経過年数|耐用年数|経年|減価|残存価値|居住年数|居住期間|入居期間|使用年数|使用状況|損耗の程度|毀損の有無|破損の有無|原因|故意過失).{0,14}(かかわらず|関わらず|問わず|問わない|考慮せず|考慮しない)/;
const RECORDS_ASSENT = /(説明|読み上げ|署名|記名|押印|同意|承諾)/;

for (const entry of corpus.cases) {
  if (!TOKUYAKU_PATTERNS[entry.expected_code].depreciationSensitive) continue;
  if (!DISCLAIMS.test(entry.clause_text)) continue;
  if (entry.expected_prongs.P4 !== true) continue;
  if (RECORDS_ASSENT.test(entry.clause_text)) continue;
  failures.push(
    `${entry.id} (${entry.expected_code}): scores P4 true on a clause that disclaims ` +
      `depreciation or degree of wear without recording any explanation or assent. ` +
      `Under 最判平成17年12月16日 that clause cannot displace art. 621 — either P4 is false, ` +
      `or the clause text must show the tenant was told and agreed.`,
  );
}

/* 8. P4 presupposes P1 and P2 -------------------------------------------- */

for (const entry of corpus.cases) {
  if (entry.expected_prongs.P4 !== true) continue;
  const { P1, P2 } = entry.expected_prongs;
  if (P1 === false || P2 === false) {
    failures.push(
      `${entry.id}: P4 true but P1=${P1} P2=${P2}. A clause cannot validly override ` +
        `art. 621 while failing the specificity or assent it depends on.`,
    );
  }
}

/* 9. the verified flag cannot be set as a formality ----------------------- */

for (const entry of corpus.cases) {
  const { verified, verification_status: status } = entry.source;
  if (verified && status !== "primary_source_verified") {
    failures.push(
      `${entry.id}: source.verified is true but verification_status is "${status}". ` +
        `The flag means a human confirmed the citation against the primary text — ` +
        `set the status first, or leave verified false.`,
    );
  }
  if (entry.clause_text_provenance === "verbatim_field_sample" && status !== "primary_source_verified") {
    failures.push(
      `${entry.id}: claims verbatim_field_sample but verification_status is "${status}". ` +
        `A verbatim transcription requires the document it was transcribed from.`,
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
const byStatus = new Map<string, number>();
for (const c of corpus.cases) {
  byStatus.set(c.source.verification_status, (byStatus.get(c.source.verification_status) ?? 0) + 1);
}
notes.push(`${unverified} entries are not primary-source verified`);
for (const status of ["primary_source_verified", "secondary_source_checked", "unverified", "not_applicable_synthetic"]) {
  notes.push(`  ${status}: ${byStatus.get(status) ?? 0}`);
}
const needHuman = corpus.cases.filter(
  (c) => c.source.verification_status === "unverified" || c.source.verification_status === "secondary_source_checked",
).length;
notes.push(`${needHuman} entries still need a human with the primary texts before any figure reaches a user`);
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
