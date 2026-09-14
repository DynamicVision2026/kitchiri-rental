/**
 * 原状回復 (move-out restoration) — numeric bands for the P3 相当性 prong.
 *
 * READ THIS BEFORE TRUSTING A NUMBER IN THIS FILE
 * -----------------------------------------------
 * The thresholds below do not all carry the same weight, and the difference is
 * legally material. Every band therefore declares its own `basis`:
 *
 *   "precedent_facts" — derived from the facts a court actually upheld or struck
 *                       down. Japanese courts in this area decide proportionality
 *                       case by case and have NOT announced bright-line ratios, so
 *                       even these are calibration points, not rules. A charge
 *                       inside the band is defensible; outside it is exposed.
 *   "guideline"       — published in the MLIT 原状回復 guidelines. Administrative
 *                       guidance, persuasive but not binding.
 *   "market_survey"   — ordinary market pricing, carrying NO legal authority. Used
 *                       only to flag a charge as an outlier worth contesting.
 *
 * Every `market_survey` band in this file is an engineering placeholder awaiting
 * the team's own sourced figures. Do not surface a `market_survey` band to a user
 * as if it were a legal threshold.
 */

/* ------------------------------------------------------------------ *
 * Band vocabulary
 * ------------------------------------------------------------------ */

export const BAND_KEYS = [
  "shikibiki",
  "koshinryo",
  "cleaning",
  "tatami",
  "cross",
  "flooring",
  "kagi",
  "shoudoku",
  "tanki_kaiyaku",
] as const;
export type BandKey = (typeof BAND_KEYS)[number];

export const BAND_BASES = ["precedent_facts", "guideline", "market_survey"] as const;
export type BandBasis = (typeof BAND_BASES)[number];

/** Where a measured value falls relative to the supported range. */
export const BAND_LEVELS = ["supported", "elevated", "excessive", "not_computable"] as const;
export type BandLevel = (typeof BAND_LEVELS)[number];

export interface BandDefinition {
  readonly key: BandKey;
  readonly basis: BandBasis;
  /** What the numbers measure, e.g. "multiple of monthly rent" or "JPY". */
  readonly unit: string;
  /** At or below this value: defensible. */
  readonly supportedMax: number;
  /** Above `supportedMax` and at or below this: contestable but has support. */
  readonly elevatedMax: number;
  /** Citation or sourcing note for the two numbers above. */
  readonly sourcing: string;
}

export interface BandResult {
  readonly key: BandKey;
  readonly level: BandLevel;
  readonly measured: number | null;
  readonly supportedMax: number;
  readonly elevatedMax: number;
  readonly basis: BandBasis;
}

function classify(def: BandDefinition, measured: number | null): BandResult {
  let level: BandLevel;
  if (measured === null || !Number.isFinite(measured)) {
    level = "not_computable";
  } else if (measured <= def.supportedMax) {
    level = "supported";
  } else if (measured <= def.elevatedMax) {
    level = "elevated";
  } else {
    level = "excessive";
  }
  return {
    key: def.key,
    level,
    measured,
    supportedMax: def.supportedMax,
    elevatedMax: def.elevatedMax,
    basis: def.basis,
  };
}

/* ------------------------------------------------------------------ *
 * Ratio bands anchored to precedent facts
 * ------------------------------------------------------------------ */

/**
 * 敷引 / 敷金償却, measured as a multiple of monthly rent.
 *
 * CITATION CORRECTED 2026-09-14. These two numbers come from two different 2011
 * Supreme Court decisions, and an earlier revision of this file attributed both to
 * 平成23年3月24日, which was wrong:
 *
 *   最判平成23年3月24日 (第一小法廷) is the framework case: a shikibiki clause is not
 *     void under 消費者契約法10条 merely because it exists, and falls only where the
 *     retained sum is 高額に過ぎる, judged against expected ordinary-wear repair cost,
 *     the rent, and any other lump sums such as 礼金. Secondary summaries report the
 *     facts as rent ¥96,000 with ¥210,000 retained — roughly 2.19x — upheld.
 *   最判平成23年7月12日 (第三小法廷) is where the 2x-to-3.5x range comes from: applying
 *     the March framework, a retention in that range was held not 高額に過ぎる.
 *
 * Neither court announced a ratio. 3.5 is the outer edge of what a reported decision
 * has tolerated on its own facts, not a safe harbour.
 *
 * VERIFY: sourced from secondary summaries only — primary text was not reachable.
 * Confirm both against 民集 before any figure derived from this band reaches a user.
 */
export const SHIKIBIKI_BAND: BandDefinition = {
  key: "shikibiki",
  basis: "precedent_facts",
  unit: "multiple of monthly rent",
  supportedMax: 2.0,
  elevatedMax: 3.5,
  sourcing:
    "supportedMax 2.0 brackets 最判平成23年3月24日 (approx. 2.19x upheld); elevatedMax 3.5 is the ceiling of the 2x-3.5x range upheld in 最判平成23年7月12日. No bright-line ratio was announced in either. Secondary sources only — unverified.",
};

/**
 * 更新料, normalised to months of rent per year of renewal term so that a 2-year
 * cycle is comparable with a 1-year cycle.
 *
 * 最判平成23年7月15日 upheld a renewal-fee clause, holding such clauses valid absent
 * 特段の事情 such as the fee being 高額に過ぎる judged against rent, fee size and
 * renewal interval.
 *
 * CONTESTED FIGURE. That judgment disposed of several consolidated appeals with
 * different numbers, and secondary summaries do not agree on which facts to quote:
 * one reports rent ¥38,000 with a fee of two months' rent on a one-year cycle
 * (2.0 per renewal year), another a ¥100,000 fee against that rent (about 2.63).
 * supportedMax 2.0 is safe under either reading. elevatedMax 2.7 assumes the higher
 * reading and is NOT safe if the lower one is right.
 *
 * VERIFY before relying on elevatedMax: pull 民集65巻5号2269頁 and fix which facts
 * the court actually upheld. Thresholds are deliberately left unchanged here rather
 * than retuned on secondary evidence, because moving them silently reclassifies
 * corpus entries.
 */
export const KOSHINRYO_BAND: BandDefinition = {
  key: "koshinryo",
  basis: "precedent_facts",
  unit: "months of rent per renewal year",
  supportedMax: 2.0,
  elevatedMax: 2.7,
  sourcing:
    "最判平成23年7月15日, which set no numeric limit, only the 高額に過ぎる standard. supportedMax 2.0 is supported under every reading of the consolidated facts; elevatedMax 2.7 depends on the contested higher reading. Secondary sources only — unverified.",
};

/**
 * 短期解約違約金, as a multiple of monthly rent. Screened under 消費者契約法9条 (a
 * penalty may not exceed the landlord's average expected loss) and 10条.
 */
export const TANKI_KAIYAKU_BAND: BandDefinition = {
  key: "tanki_kaiyaku",
  basis: "market_survey",
  unit: "multiple of monthly rent",
  supportedMax: 1.0,
  elevatedMax: 2.0,
  sourcing:
    "PLACEHOLDER. Market practice is 1-2 months within an initial 1-2 year period. 消費者契約法9条 caps a penalty at average expected loss, which is fact-specific. Needs the team's own sourcing.",
};

/* ------------------------------------------------------------------ *
 * Absolute JPY bands (market survey — no legal authority)
 * ------------------------------------------------------------------ */

/**
 * House cleaning by dwelling size. These are ordinary market ranges, NOT thresholds
 * from any guideline or decision. Under the MLIT guidelines routine cleaning is the
 * landlord's cost in the first place; these figures only tell us whether a charged
 * amount is an outlier once a clause has cleared P1 and P2.
 */
export const CLEANING_BANDS_BY_LAYOUT: Readonly<Record<string, BandDefinition>> = {
  "1R/1K": {
    key: "cleaning", basis: "market_survey", unit: "JPY",
    supportedMax: 30_000, elevatedMax: 45_000,
    sourcing: "PLACEHOLDER market range for a single-room unit. Needs sourcing.",
  },
  "1DK/1LDK": {
    key: "cleaning", basis: "market_survey", unit: "JPY",
    supportedMax: 40_000, elevatedMax: 60_000,
    sourcing: "PLACEHOLDER market range. Needs sourcing.",
  },
  "2DK/2LDK": {
    key: "cleaning", basis: "market_survey", unit: "JPY",
    supportedMax: 55_000, elevatedMax: 80_000,
    sourcing: "PLACEHOLDER market range. Needs sourcing.",
  },
  "3DK/3LDK": {
    key: "cleaning", basis: "market_survey", unit: "JPY",
    supportedMax: 80_000, elevatedMax: 110_000,
    sourcing: "PLACEHOLDER market range. Needs sourcing.",
  },
  "4LDK+": {
    key: "cleaning", basis: "market_survey", unit: "JPY",
    supportedMax: 110_000, elevatedMax: 150_000,
    sourcing: "PLACEHOLDER market range. Needs sourcing.",
  },
};

/** Fallback when the layout label is unknown but floor area is on record. */
export const CLEANING_BAND_PER_SQM: BandDefinition = {
  key: "cleaning",
  basis: "market_survey",
  unit: "JPY per square metre",
  supportedMax: 1_200,
  elevatedMax: 1_800,
  sourcing: "PLACEHOLDER per-area fallback. Needs sourcing.",
};

export const TATAMI_BAND_PER_MAT: BandDefinition = {
  key: "tatami", basis: "market_survey", unit: "JPY per mat (表替え)",
  supportedMax: 6_000, elevatedMax: 10_000,
  sourcing: "PLACEHOLDER unit price for re-facing one mat. Needs sourcing.",
};

export const CROSS_BAND_PER_SQM: BandDefinition = {
  key: "cross", basis: "market_survey", unit: "JPY per square metre",
  supportedMax: 1_200, elevatedMax: 1_800,
  sourcing: "PLACEHOLDER unit price before 経過年数 depreciation. Needs sourcing.",
};

export const FLOORING_BAND_PER_SQM: BandDefinition = {
  key: "flooring", basis: "market_survey", unit: "JPY per square metre",
  supportedMax: 5_000, elevatedMax: 9_000,
  sourcing: "PLACEHOLDER unit price for partial repair. Needs sourcing.",
};

export const KAGI_BAND: BandDefinition = {
  key: "kagi", basis: "market_survey", unit: "JPY",
  supportedMax: 20_000, elevatedMax: 35_000,
  sourcing:
    "PLACEHOLDER. Note the MLIT guidelines allocate lock replacement to the landlord where it is done for the next tenant's benefit, so P1/P2 usually decide this before P3 is reached.",
};

export const SHOUDOKU_BAND: BandDefinition = {
  key: "shoudoku", basis: "market_survey", unit: "JPY",
  supportedMax: 20_000, elevatedMax: 35_000,
  sourcing: "PLACEHOLDER. Needs sourcing.",
};

/* ------------------------------------------------------------------ *
 * 経過年数 — depreciation of the tenant's share
 * ------------------------------------------------------------------ */

/**
 * Useful lives from the MLIT 原状回復 guidelines (再改訂版, 平成23年8月). The tenant's
 * share of a replacement cost declines on a straight line across the useful life to
 * a residual value of ¥1, so a tenant who leaves at the end of the life owes
 * essentially nothing even for damage they caused.
 *
 * `null` means the guidelines do not apply 経過年数 to that item.
 */
export const DEPRECIATION_YEARS: Readonly<Record<string, number | null>> = {
  cross: 6,              // クロス（壁紙）
  cushion_floor: 6,      // クッションフロア
  carpet: 6,             // カーペット
  tatami_bed: 6,         // 畳床
  tatami_facing: null,   // 畳表 — consumable, no 経過年数
  flooring_partial: null,// フローリング部分補修 — no 経過年数
  equipment: 6,          // 設備機器（エアコン等）
  sink: 5,               // 流し台
  sanitary: 15,          // 便器・洗面台等
};

/** Guideline residual value at the end of the useful life, in JPY. */
export const RESIDUAL_VALUE_JPY = 1;

/**
 * Fraction of a replacement cost the tenant can still be asked to bear after
 * `tenancyMonths` of occupancy. Returns 1 for items the guidelines exempt from
 * 経過年数, and clamps to [0, 1].
 */
export function residualBurdenRatio(category: string, tenancyMonths: number): number {
  const years = DEPRECIATION_YEARS[category];
  if (years === undefined) return 1; // unknown category — do not silently discount
  if (years === null) return 1;      // guidelines apply no depreciation
  if (tenancyMonths <= 0) return 1;
  const ratio = 1 - tenancyMonths / (years * 12);
  return Math.min(1, Math.max(0, ratio));
}

/* ------------------------------------------------------------------ *
 * Evaluation helpers
 * ------------------------------------------------------------------ */

/** Classify an already-measured value against any band definition. */
export function evaluateAgainst(def: BandDefinition, measured: number | null): BandResult {
  return classify(def, measured);
}

export function evaluateShikibiki(retainedJpy: number, monthlyRentJpy: number): BandResult {
  const measured = monthlyRentJpy > 0 ? retainedJpy / monthlyRentJpy : null;
  return classify(SHIKIBIKI_BAND, measured);
}

export function evaluateKoshinryo(
  feeJpy: number,
  monthlyRentJpy: number,
  renewalIntervalYears: number,
): BandResult {
  const measured =
    monthlyRentJpy > 0 && renewalIntervalYears > 0
      ? feeJpy / monthlyRentJpy / renewalIntervalYears
      : null;
  return classify(KOSHINRYO_BAND, measured);
}

export function evaluateCleaning(
  chargedJpy: number,
  opts: { layout?: string | null; areaSqm?: number | null },
): BandResult {
  const byLayout = opts.layout ? CLEANING_BANDS_BY_LAYOUT[opts.layout] : undefined;
  if (byLayout) return classify(byLayout, chargedJpy);
  if (opts.areaSqm && opts.areaSqm > 0) {
    return classify(CLEANING_BAND_PER_SQM, chargedJpy / opts.areaSqm);
  }
  return classify(CLEANING_BAND_PER_SQM, null);
}

export function evaluateTankiKaiyaku(penaltyJpy: number, monthlyRentJpy: number): BandResult {
  const measured = monthlyRentJpy > 0 ? penaltyJpy / monthlyRentJpy : null;
  return classify(TANKI_KAIYAKU_BAND, measured);
}

/** Every band reachable by `bandKey` from the taxonomy, for cross-checking. */
export const BAND_REGISTRY: Readonly<Record<BandKey, BandDefinition>> = {
  shikibiki: SHIKIBIKI_BAND,
  koshinryo: KOSHINRYO_BAND,
  cleaning: CLEANING_BAND_PER_SQM,
  tatami: TATAMI_BAND_PER_MAT,
  cross: CROSS_BAND_PER_SQM,
  flooring: FLOORING_BAND_PER_SQM,
  kagi: KAGI_BAND,
  shoudoku: SHOUDOKU_BAND,
  tanki_kaiyaku: TANKI_KAIYAKU_BAND,
};
