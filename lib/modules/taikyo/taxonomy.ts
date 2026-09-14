/**
 * 原状回復 (move-out restoration) — Tokuyaku taxonomy and 4-prong evaluation model.
 *
 * Legal frame
 * -----------
 * 民法621条 (Civil Code art. 621, in force 2020-04-01) makes the tenant liable for
 * damage they caused, but expressly NOT for 通常損耗 (ordinary wear) or 経年変化
 * (aging). Article 621 is 任意規定 — a default rule — so a 特約 (special clause) may
 * shift ordinary-wear cost onto the tenant, but only if it clears a high bar.
 *
 * The bar is the 3-part test of 最判平成17年12月16日 (Supreme Court, 2005-12-16):
 *   (a) the clause states concretely what the tenant must restore and at what cost,
 *   (b) the tenant recognised they were taking on a burden beyond the statutory
 *       default, and
 *   (c) the tenant actually manifested assent to that burden.
 * Consumer leases are additionally screened by 消費者契約法10条 for clauses that
 * one-sidedly harm the consumer.
 *
 * We decompose that case law into four prongs, P1-P4, so each can be evaluated and
 * reported independently. This module owns the TYPES and the TAXONOMY only.
 * Numeric thresholds live in `./bands.ts`; the prong -> verdict engine lives in
 * `./rules.ts` and is deliberately not implemented here.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ *
 * P1-P4: the four prongs
 * ------------------------------------------------------------------ */

export const PRONG_IDS = ["P1", "P2", "P3", "P4"] as const;
export type ProngId = (typeof PRONG_IDS)[number];

export interface ProngDefinition {
  readonly id: ProngId;
  readonly labelJa: string;
  readonly labelEn: string;
  /** The question an auditor answers to score this prong. */
  readonly question: string;
  /** What a `false` on this prong means in practice. */
  readonly failureMeaning: string;
  /** Primary authority. Every entry here is a citation the team must keep current. */
  readonly authority: readonly string[];
}

export const PRONGS: Readonly<Record<ProngId, ProngDefinition>> = {
  P1: {
    id: "P1",
    labelJa: "明確性",
    labelEn: "Clarity of scope and amount",
    question:
      "Does the clause identify concretely WHICH restoration work the tenant bears and AT WHAT cost (fixed sum, unit price, or determinate formula)?",
    failureMeaning:
      "An open-ended clause ('shall restore to original condition at tenant's expense') does not put the tenant on notice of a specific burden and cannot displace art. 621.",
    authority: ["最判平成17年12月16日", "国土交通省 原状回復をめぐるトラブルとガイドライン（再改訂版, 平成23年8月）"],
  },
  P2: {
    id: "P2",
    labelJa: "所在",
    labelEn: "Contract-level provenance and assent",
    question:
      "Does the clause appear in the executed lease (or a separately signed rider), and did the tenant manifest assent to it as a burden beyond the statutory default?",
    failureMeaning:
      "A term found only in a 重要事項説明書, a handover checklist, a move-out invoice, or house rules was never agreed as a contractual burden.",
    authority: ["最判平成17年12月16日", "民法621条"],
  },
  P3: {
    id: "P3",
    labelJa: "相当性",
    labelEn: "Proportionality of the amount",
    question:
      "Is the amount within a band that case law or published guidance treats as not 高額に過ぎる, after depreciation for 経過年数?",
    failureMeaning:
      "An amount beyond the supported band is exposed under 消費者契約法10条; typically the clause survives but the recoverable sum is reduced.",
    authority: [
      "最判平成23年3月24日（敷引）",
      "最判平成23年7月15日（更新料）",
      "消費者契約法10条",
      "国土交通省 原状回復をめぐるトラブルとガイドライン（再改訂版, 平成23年8月）",
    ],
  },
  P4: {
    id: "P4",
    labelJa: "621条オーバーライド",
    labelEn: "Valid override of the art. 621 default",
    question:
      "Taken as a whole, does the clause validly displace the art. 621 rule that 通常損耗 and 経年変化 are NOT the tenant's burden?",
    failureMeaning:
      "The statutory default stands and the cost falls on the landlord, regardless of what the clause says.",
    authority: ["民法621条", "最判平成17年12月16日"],
  },
} as const;

/* ------------------------------------------------------------------ *
 * The 14 Tokuyaku patterns
 * ------------------------------------------------------------------ */

export const TOKUYAKU_CODES = [
  "TK_CLEAN",      // ハウスクリーニング費用負担
  "TK_SHIKIBIKI",  // 敷引（関西型・一定額控除）
  "TK_KOSHIN",     // 更新料
  "TK_TATAMI",     // 畳表替え
  "TK_CROSS",      // クロス（壁紙）張替え
  "TK_FLOOR",      // 床材・フローリング張替え
  "TK_TSUJO",      // 通常損耗補修の包括的転嫁
  "TK_KEINEN",     // 経年変化分の負担
  "TK_KAGI",       // 鍵交換費用
  "TK_SHOUKYAKU",  // 敷金償却（関東型）
  "TK_TAIKYO_FEE", // 退去事務手数料・解約手数料
  "TK_SHOUDOKU",   // 室内消毒・除菌施工費
  "TK_ZENMEN",     // 全面補修・無条件全面張替え
  "TK_TANKI",      // 短期解約違約金
] as const;
export type TokuyakuCode = (typeof TOKUYAKU_CODES)[number];

/**
 * Where the cost sits when no valid 特約 applies. This is the art. 621 baseline the
 * clause has to overcome, and it drives how hard P4 is to satisfy.
 */
export const STATUTORY_BASELINES = ["landlord", "tenant", "context_dependent"] as const;
export type StatutoryBaseline = (typeof STATUTORY_BASELINES)[number];

export interface TokuyakuPattern {
  readonly code: TokuyakuCode;
  readonly labelJa: string;
  readonly labelEn: string;
  /** What this clause type tries to shift onto the tenant. */
  readonly description: string;
  /** Who bears the cost under art. 621 when the clause fails. */
  readonly statutoryBaseline: StatutoryBaseline;
  /**
   * Prongs that most often decide this pattern. Every pattern is still scored on
   * all four; this only tells the UI and the reviewers where to look first.
   */
  readonly decisiveProngs: readonly ProngId[];
  /** Key into the band tables in `./bands.ts`, when the pattern has a numeric band. */
  readonly bandKey: string | null;
  /** Japanese surface forms that typically signal this pattern in a lease. */
  readonly lexicalCues: readonly string[];
  readonly authority: readonly string[];
}

export const TOKUYAKU_PATTERNS: Readonly<Record<TokuyakuCode, TokuyakuPattern>> = {
  TK_CLEAN: {
    code: "TK_CLEAN",
    labelJa: "ハウスクリーニング費用負担特約",
    labelEn: "House-cleaning cost clause",
    description:
      "Tenant pays a professional cleaning fee on move-out irrespective of how clean the unit is left. Routine cleaning is 通常損耗 under the MLIT guidelines, so this needs a valid 特約.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3"],
    bandKey: "cleaning",
    lexicalCues: ["ハウスクリーニング", "室内清掃", "クリーニング費用"],
    authority: ["国土交通省 原状回復をめぐるトラブルとガイドライン（再改訂版, 平成23年8月）", "最判平成17年12月16日"],
  },
  TK_SHIKIBIKI: {
    code: "TK_SHIKIBIKI",
    labelJa: "敷引特約",
    labelEn: "Deposit-retention (shikibiki) clause",
    description:
      "A fixed portion of the deposit is retained by the landlord regardless of actual damage. Common in Kansai.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3"],
    bandKey: "shikibiki",
    lexicalCues: ["敷引", "敷引金", "控除する"],
    authority: ["最判平成23年3月24日", "消費者契約法10条"],
  },
  TK_KOSHIN: {
    code: "TK_KOSHIN",
    labelJa: "更新料特約",
    labelEn: "Lease-renewal fee clause",
    description:
      "Tenant pays a fee to renew the lease term. Not a restoration cost, but audited alongside because it is screened under the same 消費者契約法10条 proportionality test.",
    statutoryBaseline: "tenant",
    decisiveProngs: ["P1", "P3"],
    bandKey: "koshinryo",
    lexicalCues: ["更新料", "更新事務手数料"],
    authority: ["最判平成23年7月15日", "消費者契約法10条"],
  },
  TK_TATAMI: {
    code: "TK_TATAMI",
    labelJa: "畳表替え特約",
    labelEn: "Tatami facing replacement clause",
    description:
      "Tenant pays to re-face tatami on move-out. Under the MLIT guidelines 畳表 is treated as a consumable with no 経過年数 depreciation, which makes P3 turn on unit price rather than on age.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3"],
    bandKey: "tatami",
    lexicalCues: ["畳表替え", "畳の表替え", "畳交換"],
    authority: ["国土交通省 原状回復をめぐるトラブルとガイドライン（再改訂版, 平成23年8月）"],
  },
  TK_CROSS: {
    code: "TK_CROSS",
    labelJa: "クロス張替え特約",
    labelEn: "Wall-covering replacement clause",
    description:
      "Tenant pays for wallpaper replacement. 経過年数 applies: the guidelines give クロス a 6-year useful life straight-lining to a residual value of ¥1.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3", "P4"],
    bandKey: "cross",
    lexicalCues: ["クロス張替え", "壁紙張替え", "クロス全面"],
    authority: ["国土交通省 原状回復をめぐるトラブルとガイドライン（再改訂版, 平成23年8月）"],
  },
  TK_FLOOR: {
    code: "TK_FLOOR",
    labelJa: "床材張替え特約",
    labelEn: "Flooring replacement clause",
    description:
      "Tenant pays for flooring replacement. The guidelines treat フローリング部分補修 as not subject to 経過年数, while full replacement follows the building's useful life.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3", "P4"],
    bandKey: "flooring",
    lexicalCues: ["フローリング張替え", "床材張替え", "クッションフロア"],
    authority: ["国土交通省 原状回復をめぐるトラブルとガイドライン（再改訂版, 平成23年8月）"],
  },
  TK_TSUJO: {
    code: "TK_TSUJO",
    labelJa: "通常損耗補修特約",
    labelEn: "Blanket ordinary-wear shifting clause",
    description:
      "Generic clause making the tenant restore the unit at their own cost without naming items or amounts. This is the clause type 最判平成17年12月16日 struck down for lack of 明確性.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P2", "P4"],
    bandKey: null,
    lexicalCues: ["原状に復して", "原状回復し", "賃借人の費用負担において"],
    authority: ["最判平成17年12月16日", "民法621条"],
  },
  TK_KEINEN: {
    code: "TK_KEINEN",
    labelJa: "経年変化負担特約",
    labelEn: "Aging-cost shifting clause",
    description:
      "Clause expressly making the tenant bear 経年変化, i.e. the exact thing art. 621(1) proviso excludes. Attacks the statutory default head-on, so P4 is decisive.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P4"],
    bandKey: null,
    lexicalCues: ["経年変化", "経年劣化", "自然損耗を含む"],
    authority: ["民法621条", "最判平成17年12月16日"],
  },
  TK_KAGI: {
    code: "TK_KAGI",
    labelJa: "鍵交換費用特約",
    labelEn: "Lock replacement cost clause",
    description:
      "Tenant pays to re-key the unit on move-out. The MLIT guidelines allocate lock replacement for the NEXT tenant's benefit to the landlord.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3"],
    bandKey: "kagi",
    lexicalCues: ["鍵交換", "シリンダー交換", "錠前交換"],
    authority: ["国土交通省 原状回復をめぐるトラブルとガイドライン（再改訂版, 平成23年8月）"],
  },
  TK_SHOUKYAKU: {
    code: "TK_SHOUKYAKU",
    labelJa: "敷金償却特約",
    labelEn: "Deposit amortisation clause",
    description:
      "Kanto-style variant of shikibiki: a stated portion of the deposit is 償却 (non-refundable) on move-out. Scored against the same band as TK_SHIKIBIKI.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3"],
    bandKey: "shikibiki",
    lexicalCues: ["敷金償却", "償却する", "返還しないものとする"],
    authority: ["最判平成23年3月24日", "消費者契約法10条"],
  },
  TK_TAIKYO_FEE: {
    code: "TK_TAIKYO_FEE",
    labelJa: "退去事務手数料特約",
    labelEn: "Move-out administration fee clause",
    description:
      "Flat administrative fee charged on termination with no identified service behind it. Weak on P1 because nothing is specified beyond the sum.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3"],
    bandKey: null,
    lexicalCues: ["退去事務手数料", "解約事務手数料", "契約終了手数料"],
    authority: ["消費者契約法10条"],
  },
  TK_SHOUDOKU: {
    code: "TK_SHOUDOKU",
    labelJa: "室内消毒施工費特約",
    labelEn: "Interior disinfection fee clause",
    description:
      "Charge for disinfection or deodorising treatment, frequently billed without evidence the work was performed or needed.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P1", "P3"],
    bandKey: "shoudoku",
    lexicalCues: ["消毒施工", "除菌消臭", "抗菌施工"],
    authority: ["消費者契約法10条"],
  },
  TK_ZENMEN: {
    code: "TK_ZENMEN",
    labelJa: "全面補修特約",
    labelEn: "Unconditional full-replacement clause",
    description:
      "Requires replacement of a whole surface or room regardless of the damaged area. Conflicts with the guidelines' 毀損部分 (damaged-portion) unit of accounting.",
    statutoryBaseline: "landlord",
    decisiveProngs: ["P3", "P4"],
    bandKey: null,
    lexicalCues: ["全面張替え", "一室単位", "部屋全体を"],
    authority: ["国土交通省 原状回復をめぐるトラブルとガイドライン（再改訂版, 平成23年8月）"],
  },
  TK_TANKI: {
    code: "TK_TANKI",
    labelJa: "短期解約違約金特約",
    labelEn: "Short-term cancellation penalty clause",
    description:
      "Penalty for terminating within an initial period (commonly 1-2 years). Not a restoration cost; audited for proportionality under 消費者契約法9条・10条.",
    statutoryBaseline: "tenant",
    decisiveProngs: ["P1", "P3"],
    bandKey: "tanki_kaiyaku",
    lexicalCues: ["短期解約", "違約金", "1年未満の解約"],
    authority: ["消費者契約法9条", "消費者契約法10条"],
  },
} as const;

/* ------------------------------------------------------------------ *
 * Assessment result types
 * ------------------------------------------------------------------ */

/**
 * Outcome labels. The mapping from prong scores to a verdict is rules-engine work
 * and lives in `./rules.ts` (not yet implemented) — this only fixes the vocabulary.
 */
export const VERDICTS = [
  "enforceable",   // all four prongs hold; the charge stands as written
  "reducible",     // clause survives but the amount is cut back (typically P3 false)
  "unenforceable", // clause cannot displace art. 621; cost returns to the landlord
  "needs_review",  // insufficient information to score; route to a human
] as const;
export type Verdict = (typeof VERDICTS)[number];

export type ProngScores = Readonly<Record<ProngId, boolean>>;

/* ------------------------------------------------------------------ *
 * Zod schemas
 * ------------------------------------------------------------------ */

export const tokuyakuCodeSchema = z.enum(TOKUYAKU_CODES);
export const verdictSchema = z.enum(VERDICTS);

export const prongScoresSchema = z.object({
  P1: z.boolean(),
  P2: z.boolean(),
  P3: z.boolean(),
  P4: z.boolean(),
});

/** Facts needed to score P3; without these, proportionality is not computable. */
export const clauseContextSchema = z.object({
  prefecture: z.string().min(1).nullable(),
  layout: z.string().min(1).nullable(),
  area_sqm: z.number().positive().nullable(),
  rent_monthly_jpy: z.number().int().nonnegative().nullable(),
  deposit_jpy: z.number().int().nonnegative().nullable(),
  charged_amount_jpy: z.number().int().nonnegative().nullable(),
  tenancy_months: z.number().int().nonnegative().nullable(),
});
export type ClauseContext = z.infer<typeof clauseContextSchema>;

/**
 * How a corpus entry's clause text was obtained. Kept explicit so that a reader can
 * never mistake an illustrative clause for a quotation from a decided case.
 */
export const provenanceKindSchema = z.enum([
  "synthetic_representative",   // written by us to exemplify the pattern
  "reconstructed_from_holding", // paraphrase of the clause a cited decision describes
  "verbatim_field_sample",      // transcribed from a real lease (none yet)
]);
export type ProvenanceKind = z.infer<typeof provenanceKindSchema>;

export const sourceRefSchema = z.object({
  type: z.enum(["supreme_court", "lower_court", "guideline", "statute", "consumer_center", "synthetic"]),
  /** Citation string. MUST be checked against the primary source before use. */
  reference: z.string().min(1),
  /** True only once a human has confirmed the citation against the primary source. */
  verified: z.boolean(),
  note: z.string().nullable(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const corpusEntrySchema = z.object({
  id: z.string().regex(/^TK-\d{4}$/),
  expected_code: tokuyakuCodeSchema,
  clause_text: z.string().min(1),
  clause_text_provenance: provenanceKindSchema,
  context: clauseContextSchema,
  expected_prongs: prongScoresSchema,
  expected_verdict: verdictSchema,
  source: sourceRefSchema,
  rationale: z.string().min(1),
});
export type CorpusEntry = z.infer<typeof corpusEntrySchema>;

export const corpusSchema = z.object({
  version: z.number().int().nonnegative(),
  target_size: z.number().int().positive(),
  generated_at: z.string().min(1),
  disclaimer: z.string().min(1),
  cases: z.array(corpusEntrySchema),
});
export type Corpus = z.infer<typeof corpusSchema>;
