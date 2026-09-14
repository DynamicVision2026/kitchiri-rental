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
  VERDICT_MEANINGS,
  type TokuyakuCode,
  type Verdict,
  type VerdictMeaning,
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
import { deriveFactRequests, type FactRequest } from "./questions.ts";

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
  /**
   * The clause names concrete damage phenomena (scratches, dents, discolouration,
   * pin holes) rather than merely an item or a whole surface. This is what makes a
   * failed clause severable instead of wholly void: there is a real tenant-caused
   * core underneath the over-reach. Generic 毀損 / 破損 deliberately do NOT count —
   * they appear in blanket clauses that have no identifiable core.
   */
  identifiesDamagePhenomena: boolean;
  /**
   * The clause names an actual act the money buys (attendance, drafting, cleaning,
   * replacement...). P1 asks for scope AND amount, so a bare "administration fee of
   * 30,000 yen" fails it however precise the figure is: nothing identifies what is
   * being charged for.
   */
  namesServiceAct: boolean;
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
  damagePhenomena: /(キズ|傷|へこみ|凹み|変色|日焼け|画鋲|落書き|ヤニ|しみ|シミ|汚損|焦げ|カビ)/,
  serviceAct: /(立会|書類|精算|作成|清掃|消毒|除菌|抗菌|交換|張替え|張り替え|補修|クリーニング|施工|表替え|リフォーム|コーティング)/,
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
    identifiesDamagePhenomena: RE.damagePhenomena.test(clauseText),
    namesServiceAct: RE.serviceAct.test(clauseText),
  };
}

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

export interface Candidate {
  code: TokuyakuCode;
  /** Normalised 0..1. Driven by weighted matches, not by cue-list length. */
  score: number;
  matchedCues: readonly string[];
  /** A strong match names the pattern; a weak one is merely consistent with it. */
  strongMatches: number;
}

interface ClassifierRule {
  /** Vocabulary that names this pattern. */
  readonly strong: readonly RegExp[];
  /** Vocabulary consistent with it but shared with neighbours. */
  readonly weak: readonly RegExp[];
  /** Wording that rules the pattern OUT however much else matches. */
  readonly negative: readonly RegExp[];
}

/**
 * Classification vocabulary. This is deliberately separate from
 * `TOKUYAKU_PATTERNS[...].lexicalCues`, which documents how a pattern reads; these
 * are tuned against the golden set and measured by `npm run eval:corpus`.
 *
 * Negatives carry most of the precision. The sharpest case: a clause saying
 * 「経過年数に応じた減価を行い」 PRESERVES depreciation, which is the opposite of the
 * TK_KEINEN pattern even though it uses the same nouns. Without the negative, every
 * guideline-compliant clause misfiles as an aging-shift clause.
 */
const CLASSIFIER: Readonly<Record<TokuyakuCode, ClassifierRule>> = {
  TK_CLEAN: {
    strong: [/ハウスクリーニング/, /室内の?清掃/, /クリーニング(費用|代|費)/],
    weak: [/クリーニング/, /清掃/],
    negative: [],
  },
  TK_SHIKIBIKI: {
    strong: [/敷引/],
    weak: [/控除/, /返還しない/, /敷金/],
    // NOT negative on 償却: 敷引 (Kansai) and 償却 (Kanto) name the same mechanism and
    // do co-occur. Excluding each on the other annihilated both and classified such a
    // clause as nothing at all. Let the scores decide instead.
    negative: [],
  },
  TK_SHOUKYAKU: {
    strong: [/償却/],
    weak: [/返還しない/, /敷金/, /没収/],
    negative: [],
  },
  TK_KOSHIN: {
    strong: [/更新料/],
    weak: [/更新/],
    negative: [],
  },
  TK_TATAMI: {
    strong: [/畳/, /表替え/],
    weak: [/襖|ふすま/, /障子/, /和室/],
    negative: [],
  },
  TK_CROSS: {
    strong: [/クロス/, /壁紙/],
    weak: [/張替え|張り替え/, /壁(面|及び|・)/, /天井/],
    negative: [],
  },
  TK_FLOOR: {
    strong: [/フローリング/, /床材/, /クッションフロア/],
    weak: [/床/, /部分補修/],
    negative: [],
  },
  TK_TSUJO: {
    strong: [
      /通常損耗/,
      /通常の使用により生じた損耗/,
      /原状回復(義務|の範囲|を行う|に必要)/,
      /次の各号|各号の費用|原状回復費用負担表/,
    ],
    weak: [/原状に復して/, /一切の費用/, /自然損耗/],
    // "...は賃貸人の負担とする" is a carve-out PRESERVING the statutory allocation,
    // not a blanket shift. Without this, every guideline-compliant item clause that
    // politely reserves ordinary wear to the landlord misfiles as TK_TSUJO.
    negative: [/(通常損耗|経年変化)[^。]{0,24}(賃貸人|貸主)の負担/],
  },
  TK_KEINEN: {
    strong: [
      /経年変化/,
      /経年劣化/,
      /経過年数[^。]{0,12}(考慮せず|考慮しない|かかわらず|関わらず)/,
      /耐用年数[^。]{0,12}(かかわらず|関わらず|経過|考慮せず)/,
      /使用年数[^。]{0,8}考慮せず/,
      /減価[^。]{0,10}(考慮せず|考慮しない|行わない)/,
      /新品(購入)?(交換)?価格/,
    ],
    weak: [/経年/, /残存価値/],
    // A clause that PRESERVES depreciation is the inverse of this pattern.
    negative: [/経過年数に応じ/, /減価を行/, /(通常損耗|経年変化)[^。]{0,24}(賃貸人|貸主)の負担/],
  },
  TK_KAGI: {
    strong: [/鍵の?交換/, /シリンダー/, /錠前/],
    weak: [/鍵/, /防犯/],
    negative: [],
  },
  TK_TAIKYO_FEE: {
    strong: [/事務手数料/, /退去立会費/, /立会代行/, /解約事務/, /諸経費/, /書類手数料/],
    weak: [/手数料/, /立会/],
    negative: [],
  },
  TK_SHOUDOKU: {
    strong: [/消毒/, /除菌/, /抗菌/, /消臭/],
    weak: [/施工費/, /コーティング/],
    negative: [],
  },
  TK_ZENMEN: {
    strong: [/一室単位/, /内装[^。]{0,4}(全面|全体)/, /居室全体/, /部屋全体/, /室内全体/],
    weak: [/全面/, /全体/, /異議/],
    negative: [],
  },
  TK_TANKI: {
    strong: [/違約金/, /短期解約/, /中途解約/],
    weak: [/解約/, /未満で(本契約を)?解約/],
    negative: [],
  },
};

/** Patterns naming a single physical item, which TK_ZENMEN sits on top of. */
const ITEM_CODES = ["TK_CLEAN", "TK_CROSS", "TK_FLOOR", "TK_TATAMI"] as const;

/**
 * Patterns describing how money moves rather than what gets restored. These read as
 * more specific than any scope pattern: a deposit-retention or renewal-fee clause
 * that happens to mention 通常損耗 is still about the deposit.
 */
/** Patterns that are a charge rather than a physical restoration act. */
const FEE_PATTERNS: ReadonlySet<TokuyakuCode> = new Set<TokuyakuCode>(["TK_TAIKYO_FEE"]);

const MECHANISM_CODES = [
  "TK_SHIKIBIKI", "TK_SHOUKYAKU", "TK_KOSHIN", "TK_TANKI", "TK_TAIKYO_FEE", "TK_KAGI", "TK_SHOUDOKU",
] as const;

const STRONG_WEIGHT = 3;
const WEAK_WEIGHT = 1;
const NEGATIVE_WEIGHT = 5;
/** Enough weighted evidence that the top candidate is worth acting on. */
export const CONFIDENT_SCORE = 0.5;

/**
 * Weighted classifier with two precedence rules that plain scoring cannot express,
 * because TK_TSUJO and TK_ZENMEN are not siblings of the item patterns — they sit
 * above them:
 *
 *   1. TK_TSUJO wins outright on its own vocabulary. A clause framed around 通常損耗
 *      or an itemised 原状回復 schedule is a blanket shifting clause even though it
 *      also mentions cleaning, cross and tatami.
 *   2. TK_ZENMEN wins when it names a whole-room remedy, or when two or more item
 *      patterns fire at once — covering several item types in one sweep is what the
 *      pattern IS.
 */
export function classifyClause(clauseText: string): Candidate[] {
  const raw = new Map<TokuyakuCode, { score: number; cues: string[]; strong: number }>();

  for (const code of TOKUYAKU_CODES) {
    const rule = CLASSIFIER[code];
    const cues: string[] = [];
    let strong = 0;
    let score = 0;
    for (const re of rule.strong) {
      const m = clauseText.match(re);
      if (m) { strong += 1; score += STRONG_WEIGHT; cues.push(m[0]); }
    }
    for (const re of rule.weak) {
      const m = clauseText.match(re);
      if (m) { score += WEAK_WEIGHT; cues.push(m[0]); }
    }
    let negatives = 0;
    for (const re of rule.negative) if (re.test(clauseText)) negatives += 1;
    score -= negatives * NEGATIVE_WEIGHT;
    if (score > 0) raw.set(code, { score, cues, strong });
  }

  // ---- precedence ladder -------------------------------------------------
  // Plain scoring cannot express that some patterns are not siblings of the others.
  // Each rung wins outright over the rungs below it.
  const strongOf = (c: TokuyakuCode) => raw.get(c)?.strong ?? 0;
  const itemsFiring = ITEM_CODES.filter((c) => strongOf(c) > 0).length;
  let forced: TokuyakuCode | null = null;

  // 1. A money mechanism (deposit retention, renewal fee, penalty, admin/key fee) is
  //    orthogonal to restoration scope and always the more specific reading. A
  //    shikibiki clause that mentions 通常損耗 is still a shikibiki clause.
  //    Guarded by score: a trailing 「諸経費一律45,000円」 on a flooring clause must not
  //    turn it into a fee clause, so the mechanism has to out-score the scope reading
  //    outright rather than merely appear.
  const scoreOf = (c: TokuyakuCode) => raw.get(c)?.score ?? 0;
  const bestNonMechanism = Math.max(
    0,
    ...TOKUYAKU_CODES.filter((c) => !MECHANISM_CODES.includes(c as (typeof MECHANISM_CODES)[number])).map(scoreOf),
  );
  const mechanism = MECHANISM_CODES.filter((c) => strongOf(c) > 0)
    .sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  const mechanismPresent = mechanism !== undefined;
  if (mechanism && scoreOf(mechanism) > bestNonMechanism) forced = mechanism;

  // 2. TK_KEINEN outranks TK_TSUJO: shifting 経年変化 specifically is narrower than
  //    shifting ordinary wear generally, and its negatives have already removed the
  //    clauses that merely preserve depreciation. It does NOT outrank a named item —
  //    a cross clause carrying a 経過年数 disclaimer is still a cross clause.
  else if (strongOf("TK_KEINEN") > 0 && itemsFiring === 0 && !mechanismPresent) forced = "TK_KEINEN";

  // 3. A blanket ordinary-wear clause is TK_TSUJO whatever items it also names.
  // Guarded on mechanism too: 「敷引3ヶ月分。ただし通常損耗の補修費用もここから充当する」
  // is a shikibiki clause that mentions ordinary wear, not an ordinary-wear clause.
  else if (strongOf("TK_TSUJO") > 0 && !mechanismPresent) forced = "TK_TSUJO";

  // 4. TK_ZENMEN: a whole-room remedy, or two or more item patterns swept together.
  //    The second case can fire when TK_ZENMEN scored nothing on its own vocabulary,
  //    so it is admitted here rather than read out of the score map.
  else if (strongOf("TK_ZENMEN") > 0 || itemsFiring >= 2) forced = "TK_ZENMEN";

  if (forced) {
    const existing = raw.get(forced);
    raw.set(forced, existing ?? { score: STRONG_WEIGHT, cues: [], strong: 0 });
    raw.get(forced)!.score += 100;
  }

  const maxScore = Math.max(1, ...[...raw.values()].map((v) => Math.min(v.score, 12)));
  return [...raw.entries()]
    .map(([code, v]) => ({
      code,
      score: Math.min(v.score, 12) / maxScore,
      matchedCues: v.cues,
      strongMatches: v.strong,
      _raw: v.score,
    }))
    .sort((a, b) => b._raw - a._raw || a.code.localeCompare(b.code))
    .map(({ _raw, ...c }) => c);
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
  declared?: DeclaredFacts;
}): { scores: ProngScores; reasons: ProngReasons } {
  const { code, signals, placement, band } = args;
  const declared = args.declared ?? { amount_fixed_in_contract: null };
  const pattern = TOKUYAKU_PATTERNS[code];
  const reasons: Record<ProngId, string> = { P1: "", P2: "", P3: "", P4: "" };

  // P1 明確性 — scope and amount determinable at signing.
  let P1: ProngScore;
  if (signals.defersScopeOrAmount) {
    P1 = false;
    reasons.P1 = "Scope or amount is left for the landlord to fix later, so the burden was not determinable at signing.";
  } else if (FEE_PATTERNS.has(code) && signals.statesAmount && !signals.namesServiceAct) {
    P1 = false;
    reasons.P1 = "Names a sum but no service. P1 asks for scope as well as amount, and a bare fee identifies nothing the money buys.";
  } else if (signals.statesAmount || signals.statesUnitPrice) {
    P1 = true;
    reasons.P1 = signals.statesUnitPrice ? "States a per-unit rate." : "States a fixed sum.";
  } else if (declared.amount_fixed_in_contract === true) {
    P1 = true;
    reasons.P1 = "The clause names no figure, but the user confirms the contract or an attached schedule fixes one.";
  } else if (declared.amount_fixed_in_contract === false) {
    P1 = false;
    reasons.P1 = "No figure in the clause, and the user confirms none is fixed anywhere in the contract. The burden was not determinable at signing.";
  } else {
    P1 = "unknown";
    reasons.P1 = "No figure or rate found in the clause. An incorporated schedule may still fix one — ask before deciding.";
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
 * Prong vector -> verdict.
 *
 * `severableCore` carries the one thing the prongs cannot: whether, underneath a
 * failed article 621 override, the clause named damage the tenant could actually
 * have caused. When it did, striking the clause outright would tell the tenant they
 * owe nothing — but article 621(1) makes them liable for their own damage whether or
 * not the 特約 survives, so "unenforceable" would overstate their position. That case
 * is `severable`: void as to ordinary wear, alive for the damage.
 *
 * Severability is only reachable where P1 and P2 have not themselves failed. A clause
 * that never fixed its scope, or was never agreed, has no core to fall back to.
 */
export function deriveVerdict(
  scores: ProngScores,
  opts?: { severableCore?: boolean; p3Applicable?: boolean },
): Verdict {
  const { P1, P2, P3, P4 } = scores;
  if (P1 === false || P2 === false) return "unenforceable";
  if (P4 === false) {
    return opts?.severableCore && P1 === true && P2 === true ? "severable" : "unenforceable";
  }
  if (P1 === true && P2 === true && P4 === true) {
    if (P3 === false) return "reducible";
    if (P3 === true) return "enforceable";
    // A pattern with no numeric band has no proportionality question to answer, so
    // an unknown P3 must not hold the verdict open. Leaving it open sent clauses like
    // a blanket 原状回復 term to needs_review with NOTHING left to ask, which is a
    // dead end for the user: the flow asks nothing and still refuses to conclude.
    if (P3 === "unknown" && opts?.p3Applicable === false) return "enforceable";
  }
  return "needs_review";
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

/**
 * Facts the user supplies that the clause text cannot reveal. Kept separate from
 * `context` (which is figures) and from `placement` (which is a document), so that
 * an engine answer is never confused with a user assertion.
 */
export const declaredFactsSchema = z.object({
  /**
   * Does the contract or an attached schedule fix an amount or unit price for this
   * item? Resolves P1 where the clause itself names no figure.
   */
  amount_fixed_in_contract: z.boolean().nullable().default(null),
});
export type DeclaredFacts = z.infer<typeof declaredFactsSchema>;

export const evaluateRequestSchema = z.object({
  clause_text: z.string().min(1).max(4000),
  placement: z.enum(PLACEMENTS).default("unknown"),
  context: clauseContextSchema.nullable().default(null),
  /** Override the classifier when the caller already knows the pattern. */
  code: z.enum(TOKUYAKU_CODES).nullable().default(null),
  declared: declaredFactsSchema.default({ amount_fixed_in_contract: null }),
});
export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;
/** What a caller may pass: defaults are filled in by `evaluateClause` itself. */
export type EvaluateInput = z.input<typeof evaluateRequestSchema>;

export interface ClauseEvaluation {
  code: TokuyakuCode | null;
  classification: { chosen: TokuyakuCode | null; confident: boolean; candidates: Candidate[] };
  signals: ClauseSignals;
  prongs: ProngScores;
  reasons: ProngReasons;
  band: BandResult | null;
  verdict: Verdict;
  /** Labels and the plain-language line for this verdict, ja and en. */
  remedy: VerdictMeaning;
  /** True when any prong is unknown, or the classifier was not confident. */
  reviewRequired: boolean;
  authorities: readonly string[];
  /**
   * The specific facts still missing, in the order worth asking. Empty when the
   * verdict is decisive, or when nothing further would change it.
   */
  missingFacts: FactRequest[];
  advisory: string;
}

const ADVISORY =
  "Provisional output. P1, P2 and P4 are legal judgments approximated by heuristics here; only P3 is computed. " +
  "The rule set is calibrated against a golden set whose citations are NOT yet primary-source verified " +
  "(see docs/citation-audit-checklist.md). Not legal advice, and not fit to be shown to a tenant as a conclusion.";

export function evaluateClause(raw: EvaluateInput): ClauseEvaluation {
  // Parse here rather than trusting the caller, so defaults are always applied and
  // every entry point — API route, scorecard, test — behaves identically.
  const input = evaluateRequestSchema.parse(raw);
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
      remedy: VERDICT_MEANINGS.needs_review,
      reviewRequired: true,
      authorities: [],
      missingFacts: [],
      advisory: ADVISORY,
    };
  }

  const band = input.context ? computeBand(chosen, input.context) : null;
  const { scores, reasons } = scoreProngs({
    code: chosen, signals, placement: input.placement, band, declared: input.declared,
  });
  const verdict = deriveVerdict(scores, {
    severableCore: signals.identifiesDamagePhenomena,
    p3Applicable: TOKUYAKU_PATTERNS[chosen].bandKey !== null,
  });
  const anyUnknown = PRONG_IDS.some((id) => scores[id] === "unknown");

  return {
    code: chosen,
    classification: { chosen, confident, candidates },
    signals,
    prongs: scores,
    reasons,
    band,
    verdict,
    remedy: VERDICT_MEANINGS[verdict],
    reviewRequired: anyUnknown || !confident,
    authorities: TOKUYAKU_PATTERNS[chosen].authority,
    missingFacts: deriveFactRequests({
      code: chosen,
      prongs: scores,
      context: input.context,
      placementKnown: input.placement !== "unknown",
      amountDeclared: input.declared.amount_fixed_in_contract !== null,
    }),
    advisory: ADVISORY,
  };
}
