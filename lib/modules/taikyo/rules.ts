/**
 * 原状回復 (move-out restoration) — clause evaluation engine.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY REFUSES TO DO
 * ------------------------------------------------------
 * Of the four prongs, exactly one is arithmetic. P3 (相当性) is a number against a
 * band, and the engine answers it outright. P1, P2 and P4 are legal judgments about
 * specificity, where a term sits in the contract, and whether the tenant was put on
 * notice. Nothing here can read a lease and decide those the way a lawyer would.
 *
 * So the engine reports "unknown" rather than guessing, and the ProngScore type is
 * tri-state precisely so that it can. An unknown routes the clause to `needs_review`;
 * it never silently becomes a `false` that tells a tenant to refuse a bill.
 *
 * Two inputs the caller must supply, because the clause text does not carry them:
 *   - `placement`: where the term was found. A term in the signed lease is agreed;
 *     the same words in a handout are not. This is a question for the UI, not a regex.
 *   - `context`: rent, amounts, unit prices. Without these P3 is unanswerable.
 *
 * Every heuristic below is marked provisional and is measured against the golden set
 * by `npm run eval:corpus`. Read that scorecard before trusting any output.
 */

import { z } from "zod";
import {
  PRONG_IDS,
  TOKUYAKU_CODES,
  TOKUYAKU_PATTERNS,
  clauseContextSchema,
  type ClauseContext,
  type ProngId,
  type ProngScore,
  type ProngScores,
  type TokuyakuCode,
  type Verdict,
} from "./taxonomy.ts";
import {
  CLEANING_BANDS_BY_LAYOUT,
  CROSS_BAND_PER_SQM,
  FLOORING_BAND_PER_SQM,
  KAGI_BAND,
  SHOUDOKU_BAND,
  TATAMI_BAND_PER_MAT,
  evaluateAgainst,
  evaluateCleaning,
  evaluateKoshinryo,
  evaluateShikibiki,
  evaluateTankiKaiyaku,
  type BandResult,
} from "./bands.ts";

/* ------------------------------------------------------------------ *
 * Where the term was found
 * ------------------------------------------------------------------ */

export const PLACEMENTS = [
  "lease_body",           // 契約書本体
  "signed_rider",         // 個別に署名された特約書面
  "explanatory_document", // 重要事項説明書
  "house_rules",          // 入居のしおり・管理規約など
  "unknown",
] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** Placements that establish the term was agreed as a contractual burden. */
const AGREED: ReadonlySet<Placement> = new Set<Placement>(["lease_body", "signed_rider"]);
const NOT_AGREED: ReadonlySet<Placement> = new Set<Placement>(["explanatory_document", "house_rules"]);

/* ------------------------------------------------------------------ *
 * Surface signals
 * ------------------------------------------------------------------ */

export interface ClauseSignals {
  /** A yen figure appears in the clause. */
  statesAmount: boolean;
  /** A per-unit rate appears (per ㎡, per mat, per location). */
  statesUnitPrice: boolean;
  /** The clause records explanation to, or assent by, the tenant. */
  recordsAssent: boolean;
  /** "Irrespective of" occupancy, age, or degree of wear. */
  disclaimsDepreciation: boolean;
  /** Scope or amount is left for the landlord to fix later. */
  defersScopeOrAmount: boolean;
  /** The clause expressly keeps depreciation or leaves ordinary wear with the landlord. */
  preservesDepreciation: boolean;
  /**
   * The charge accrues whether or not the work is actually done. There is then no
   * service being bought, so the money is not a restoration cost at all and cannot
   * displace the statutory allocation however clearly it is written.
   */
  chargeIrrespectiveOfPerformance: boolean;
}

const RE = {
  amount: /[0-9０-９][0-9０-９,，.]*\s*円/,
  unitPrice: /(あたり|当たり|単価|\/\s*(㎡|平方メートル|畳|枚))/,
  assent: /(説明|読み上げ|署名|記名|押印|同意|承諾)/,
  disclaim:
    /(経過年数|耐用年数|経年|減価|残存価値|居住年数|居住期間|入居期間|使用年数|使用状況|損耗の程度|毀損の有無|破損の有無|原因|故意過失).{0,14}(かかわらず|関わらず|問わず|問わない|考慮せず|考慮しない)/,
  defer: /((貸主|賃貸人)が(指定|決定|定め)|別途定め|後日|事後に|明渡し後に|実費を請求|管理規約による)/,
  preserve: /(経過年数に応じ|減価を行|(通常損耗|経年変化)[^。]{0,24}(賃貸人|貸主)の負担)/,
  noPerformance: /(実施・不実施|実施の有無|施工の有無|履行の有無|作業の有無)[^。]{0,16}(かかわらず|関わらず|問わず)/,
} as const;

export function detectSignals(clauseText: string): ClauseSignals {
  return {
    statesAmount: RE.amount.test(clauseText),
    statesUnitPrice: RE.unitPrice.test(clauseText),
    recordsAssent: RE.assent.test(clauseText),
    disclaimsDepreciation: RE.disclaim.test(clauseText),
    defersScopeOrAmount: RE.defer.test(clauseText),
    preservesDepreciation: RE.preserve.test(clauseText),
    chargeIrrespectiveOfPerformance: RE.noPerformance.test(clauseText),
  };
}

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

export interface Candidate {
  code: TokuyakuCode;
  /** Matched cues over the pattern's total cues, 0..1. */
  score: number;
  matchedCues: readonly string[];
}

/**
 * Lexical-cue classifier. Provisional: it matches surface vocabulary, so a clause
 * mentioning two patterns scores for both, and a clause using unseen wording scores
 * for none. Callers should treat anything below `CONFIDENT` as a shortlist for a
 * human, not an answer.
 */
export const CONFIDENT_SCORE = 0.34;

export function classifyClause(clauseText: string): Candidate[] {
  const out: Candidate[] = [];
  for (const code of TOKUYAKU_CODES) {
    const cues = TOKUYAKU_PATTERNS[code].lexicalCues;
    const matched = cues.filter((cue) => clauseText.includes(cue));
    if (matched.length > 0) out.push({ code, score: matched.length / cues.length, matchedCues: matched });
  }
  return out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
}

/* ------------------------------------------------------------------ *
 * Bands (P3)
 * ------------------------------------------------------------------ */

export function computeBand(code: TokuyakuCode, ctx: ClauseContext): BandResult | null {
  const charged = ctx.charged_amount_jpy;
  const rent = ctx.rent_monthly_jpy;
  const unit = ctx.unit_price_jpy ?? null;
  switch (code) {
    case "TK_SHIKIBIKI":
    case "TK_SHOUKYAKU":
      return rent && charged !== null ? evaluateShikibiki(charged, rent) : null;
    case "TK_TANKI":
      return rent && charged !== null ? evaluateTankiKaiyaku(charged, rent) : null;
    case "TK_KOSHIN": {
      const years = ctx.renewal_interval_years ?? null;
      return rent && years && charged !== null ? evaluateKoshinryo(charged, rent, years) : null;
    }
    case "TK_CLEAN":
      return charged !== null && ctx.layout && ctx.layout in CLEANING_BANDS_BY_LAYOUT
        ? evaluateCleaning(charged, { layout: ctx.layout })
        : null;
    case "TK_KAGI":
      return charged !== null ? evaluateAgainst(KAGI_BAND, charged) : null;
    case "TK_SHOUDOKU":
      return charged !== null ? evaluateAgainst(SHOUDOKU_BAND, charged) : null;
    case "TK_TATAMI":
      return unit === null ? null : evaluateAgainst(TATAMI_BAND_PER_MAT, unit);
    case "TK_CROSS":
      return unit === null ? null : evaluateAgainst(CROSS_BAND_PER_SQM, unit);
    case "TK_FLOOR":
      return unit === null ? null : evaluateAgainst(FLOORING_BAND_PER_SQM, unit);
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Prong scoring
 * ------------------------------------------------------------------ */

export type ProngReasons = Readonly<Record<ProngId, string>>;

export function scoreProngs(args: {
  code: TokuyakuCode;
  signals: ClauseSignals;
  placement: Placement;
  band: BandResult | null;
}): { scores: ProngScores; reasons: ProngReasons } {
  const { code, signals, placement, band } = args;
  const pattern = TOKUYAKU_PATTERNS[code];
  const reasons: Record<ProngId, string> = { P1: "", P2: "", P3: "", P4: "" };

  // P1 明確性 — scope and amount determinable at signing.
  let P1: ProngScore;
  if (signals.defersScopeOrAmount) {
    P1 = false;
    reasons.P1 = "Scope or amount is left for the landlord to fix later, so the burden was not determinable at signing.";
  } else if (signals.statesAmount || signals.statesUnitPrice) {
    P1 = true;
    reasons.P1 = signals.statesUnitPrice ? "States a per-unit rate." : "States a fixed sum.";
  } else {
    P1 = "unknown";
    reasons.P1 = "No figure or rate found in the clause. Specificity may still be met by an incorporated schedule — needs a human.";
  }

  // P2 所在 — supplied by the caller; the clause text cannot answer it.
  let P2: ProngScore;
  if (AGREED.has(placement)) {
    P2 = true;
    reasons.P2 = `Recorded as appearing in ${placement}, which is contract-level.`;
  } else if (NOT_AGREED.has(placement)) {
    P2 = false;
    reasons.P2 = `Recorded as appearing only in ${placement}, which is not a contractual burden.`;
  } else {
    P2 = "unknown";
    reasons.P2 = "Placement not supplied. Ask where in the paperwork the term appears.";
  }

  // P3 相当性 — the one prong that is arithmetic.
  let P3: ProngScore;
  if (band === null || band.level === "not_computable") {
    P3 = "unknown";
    reasons.P3 = pattern.bandKey === null
      ? "This pattern has no numeric band; proportionality is not the operative question."
      : "Not enough context to place the amount in its band (need rent, charged amount, layout or unit price).";
  } else {
    P3 = band.level !== "excessive";
    reasons.P3 = `Measured ${band.measured?.toFixed(2)} against the ${band.key} band (supported ≤ ${band.supportedMax}, elevated ≤ ${band.elevatedMax}): ${band.level}.`;
  }

  // P4 621条 — the 最判平成17年12月16日 rule.
  let P4: ProngScore;
  if (signals.chargeIrrespectiveOfPerformance) {
    P4 = false;
    reasons.P4 = "The charge accrues whether or not the work is performed, so nothing is being bought. A payment with no service behind it is not a restoration cost and cannot displace the statutory allocation.";
  } else if (pattern.depreciationSensitive && signals.disclaimsDepreciation && !signals.recordsAssent) {
    P4 = false;
    reasons.P4 = "Shifts cost irrespective of occupancy, age or degree of wear, with no explanation or assent recorded. Under 最判平成17年12月16日 it cannot displace art. 621.";
  } else if (P1 === false || P2 === false) {
    P4 = false;
    reasons.P4 = "Fails the specificity or assent that a valid override depends on.";
  } else if (P1 === true && P2 === true) {
    P4 = true;
    reasons.P4 = "Specific and agreed at contract level, with no unqualified disclaimer of depreciation.";
  } else {
    P4 = "unknown";
    reasons.P4 = "Turns on P1/P2, which are not yet settled.";
  }

  return { scores: { P1, P2, P3, P4 }, reasons };
}

/* ------------------------------------------------------------------ *
 * Verdict
 * ------------------------------------------------------------------ */

/**
 * Prong vector -> verdict. Reproduces 78 of the 80 golden-set labels exactly.
 *
 * The two it does not reproduce (TK-0038, TK-0039) are labelled 一部無効 in the sense
 * of SEVERABILITY — void as to ordinary wear, still good for damage the tenant
 * actually caused — whereas `reducible` in this enum means the AMOUNT is cut back.
 * The prong vector cannot tell those apart, so the enum is under-specified. Erring
 * toward `unenforceable` is the safer side for a landlord-facing claim; adding a
 * fifth state is a product decision, not something to paper over here.
 */
export function deriveVerdict(scores: ProngScores): Verdict {
  const { P1, P2, P3, P4 } = scores;
  if (P1 === false || P2 === false || P4 === false) return "unenforceable";
  if (P1 === true && P2 === true && P4 === true) {
    if (P3 === false) return "reducible";
    if (P3 === true) return "enforceable";
  }
  return "needs_review";
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

export const evaluateRequestSchema = z.object({
  clause_text: z.string().min(1).max(4000),
  placement: z.enum(PLACEMENTS).default("unknown"),
  context: clauseContextSchema.nullable().default(null),
  /** Override the classifier when the caller already knows the pattern. */
  code: z.enum(TOKUYAKU_CODES).nullable().default(null),
});
export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

export interface ClauseEvaluation {
  code: TokuyakuCode | null;
  classification: { chosen: TokuyakuCode | null; confident: boolean; candidates: Candidate[] };
  signals: ClauseSignals;
  prongs: ProngScores;
  reasons: ProngReasons;
  band: BandResult | null;
  verdict: Verdict;
  /** True when any prong is unknown, or the classifier was not confident. */
  reviewRequired: boolean;
  authorities: readonly string[];
  advisory: string;
}

const ADVISORY =
  "Provisional output. P1, P2 and P4 are legal judgments approximated by heuristics here; only P3 is computed. " +
  "The rule set is calibrated against a golden set whose citations are NOT yet primary-source verified " +
  "(see docs/citation-audit-checklist.md). Not legal advice, and not fit to be shown to a tenant as a conclusion.";

export function evaluateClause(input: EvaluateRequest): ClauseEvaluation {
  const signals = detectSignals(input.clause_text);
  const candidates = classifyClause(input.clause_text);
  const chosen = input.code ?? candidates[0]?.code ?? null;
  const confident = input.code !== null || (candidates[0]?.score ?? 0) >= CONFIDENT_SCORE;

  if (chosen === null) {
    return {
      code: null,
      classification: { chosen: null, confident: false, candidates },
      signals,
      prongs: { P1: "unknown", P2: "unknown", P3: "unknown", P4: "unknown" },
      reasons: {
        P1: "No pattern recognised.", P2: "No pattern recognised.",
        P3: "No pattern recognised.", P4: "No pattern recognised.",
      },
      band: null,
      verdict: "needs_review",
      reviewRequired: true,
      authorities: [],
      advisory: ADVISORY,
    };
  }

  const band = input.context ? computeBand(chosen, input.context) : null;
  const { scores, reasons } = scoreProngs({ code: chosen, signals, placement: input.placement, band });
  const verdict = deriveVerdict(scores);
  const anyUnknown = PRONG_IDS.some((id) => scores[id] === "unknown");

  return {
    code: chosen,
    classification: { chosen, confident, candidates },
    signals,
    prongs: scores,
    reasons,
    band,
    verdict,
    reviewRequired: anyUnknown || !confident,
    authorities: TOKUYAKU_PATTERNS[chosen].authority,
    advisory: ADVISORY,
  };
}
