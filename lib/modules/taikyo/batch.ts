/**
 * 契約書全文の一括診断 — segment a whole lease, evaluate every clause, aggregate.
 *
 * ON THE MONEY FIGURE
 * -------------------
 * A contract-text-only scan cannot compute what a tenant will actually be charged:
 * the lease says what MAY be charged, not what WAS. So the exposure figure here is
 * explicitly an UPPER BOUND assembled from sums the contract itself states, and it
 * carries its own caveats rather than presenting as a settled number. Amounts that
 * cannot be resolved from the document (「賃料2か月分」 with the rent elsewhere, or a
 * clause with no figure at all) are counted separately instead of being guessed at
 * or silently dropped.
 */

import { segmentContract, segmentLabel, type ContractSegment } from "./segment.ts";
import { evaluateClause, type ClauseEvaluation, type Placement } from "./rules.ts";
import { VERDICTS, type Verdict } from "./taxonomy.ts";

/* ------------------------------------------------------------------ *
 * Amounts stated in the clause itself
 * ------------------------------------------------------------------ */

const YEN_RE = /(?:金\s*)?([0-9０-９][0-9０-９,，]*)\s*円/g;
const RENT_MONTHS_RE = /賃料(?:及び[^\s]{0,8})?\s*([0-9０-９]+(?:[.．][0-9０-９]+)?|[一二三四五六七八九十]+)\s*(?:か|ヶ|ケ|箇)?月分/g;

const KANJI_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function toNumber(raw: string): number | null {
  const half = raw.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, "").replace(/[．]/g, ".");
  if (/^\d+(\.\d+)?$/.test(half)) return Number(half);
  const kanji = KANJI_NUM[raw];
  return kanji ?? null;
}

export interface ClauseAmounts {
  /** Every yen figure appearing in the clause, in document order. */
  yen: number[];
  /** Every "N months of rent" expression found. */
  rentMonths: number[];
  /**
   * The figure this clause contributes to the headline. Null when the clause states
   * no yen amount. Where several appear — a deposit AND the portion retained from it —
   * the largest is taken, which is why the report labels the total an upper bound.
   */
  headlineJpy: number | null;
  /** True when several yen figures were found, so the headline needs confirming. */
  ambiguous: boolean;
}

export function extractAmounts(text: string): ClauseAmounts {
  const yen: number[] = [];
  for (const m of text.matchAll(YEN_RE)) {
    const n = toNumber(m[1]);
    if (n !== null && n > 0) yen.push(n);
  }
  const rentMonths: number[] = [];
  for (const m of text.matchAll(RENT_MONTHS_RE)) {
    const n = toNumber(m[1]);
    if (n !== null && n > 0) rentMonths.push(n);
  }
  return {
    yen,
    rentMonths,
    headlineJpy: yen.length > 0 ? Math.max(...yen) : null,
    ambiguous: yen.length > 1,
  };
}

/* ------------------------------------------------------------------ *
 * Facts the document states about itself
 * ------------------------------------------------------------------ */

const RENT_RE = /賃料[^。]{0,8}(?:月額|は)[^。]{0,4}?(?:金\s*)?([0-9０-９][0-9０-９,，]*)\s*円/;
const DEPOSIT_RE = /敷金[^。]{0,12}?(?:金\s*)?([0-9０-９][0-9０-９,，]*)\s*円/;
const UNIT_PRICE_RE = /(?:[1１一])\s*(?:平方メートル|㎡|畳|枚|面|か所|箇所)\s*(?:あたり|当たり)\s*(?:金\s*)?([0-9０-９][0-9０-９,，]*)\s*円/;
const RENEWAL_RE = /([0-9０-９]+|[一二三四五六七八九十]+)\s*年\s*(?:毎|ごと)/;

/**
 * A lease states its own rent, and that single figure unlocks the ratio bands for
 * every 敷引 / 更新料 / 違約金 clause in the document. Reading it once here is the
 * difference between a scan that can answer P3 and one that asks the user to retype
 * a number the contract already contains.
 */
export interface ContractFacts {
  rentMonthlyJpy: number | null;
  depositJpy: number | null;
}

export function extractContractFacts(source: string): ContractFacts {
  const rent = source.match(RENT_RE);
  const deposit = source.match(DEPOSIT_RE);
  return {
    rentMonthlyJpy: rent ? toNumber(rent[1]) : null,
    depositJpy: deposit ? toNumber(deposit[1]) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Report shape
 * ------------------------------------------------------------------ */

/** Verdicts that cost the tenant something, in descending severity. */
export const ADVERSE_VERDICTS: readonly Verdict[] = ["unenforceable", "severable", "reducible"];

export interface ClauseFinding {
  index: number;
  label: string;
  isTokuyakuSection: boolean;
  text: string;
  start: number;
  end: number;
  amounts: ClauseAmounts;
  evaluation: ClauseEvaluation;
}

export interface FinancialExposure {
  /** Sum of the headline figure across adverse clauses. An UPPER BOUND. */
  statedJpy: number;
  /** Adverse clauses expressed as months of rent, summed. Not converted to yen. */
  rentMonths: number;
  /** Adverse clauses stating no figure anywhere. */
  unquantifiedCount: number;
  /** Adverse clauses where several figures appeared and the largest was taken. */
  ambiguousCount: number;
  /**
   * Money named in clauses that came back needs_review. NOT part of statedJpy — the
   * verdict is undecided — but it must be visible, or the largest charge in a lease
   * can vanish from the headline simply because one fact is missing.
   */
  unresolvedJpy: number;
  /** needs_review clauses carrying a figure, i.e. what answering a question would settle. */
  unresolvedCount: number;
  caveats: string[];
}

export type RiskLevel = "low" | "moderate" | "high";

export interface BatchReport {
  totalSegments: number;
  /** Segments the classifier recognised as a Tokuyaku pattern. */
  clausesEvaluated: number;
  /** Segments with no recognisable pattern — ordinary contract text, not a finding. */
  clausesSkipped: number;
  verdictCounts: Record<Verdict, number>;
  adverseCount: number;
  riskLevel: RiskLevel;
  exposure: FinancialExposure;
  findings: ClauseFinding[];
  advisory: string;
}

/**
 * Risk band. Stated as a rule rather than a score, because a 0-100 number would imply
 * a precision this analysis does not have.
 *   high     — 3+ clauses that cannot stand, or 5+ adverse clauses overall
 *   moderate — at least one adverse clause
 *   low      — none
 */
export function riskLevelOf(counts: Record<Verdict, number>): RiskLevel {
  const adverse = ADVERSE_VERDICTS.reduce((n, v) => n + counts[v], 0);
  if (counts.unenforceable >= 3 || adverse >= 5) return "high";
  if (adverse >= 1) return "moderate";
  return "low";
}

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

/**
 * Bounded-concurrency map. The engine is synchronous CPU work today, so this does not
 * speed anything up — it is the seam. When clause extraction grows an async step
 * (an LLM pass, a lookup), it slots in here without the callers changing.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R> | R,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export const DEFAULT_CONCURRENCY = 8;

export interface BatchOptions {
  /**
   * Where the pasted text came from. Defaults to the lease body, which is what a user
   * pasting 契約書全文 is giving us — so P2 is satisfied and verdicts can be decisive.
   */
  placement?: Placement;
  concurrency?: number;
}

export async function evaluateContract(source: string, options: BatchOptions = {}): Promise<BatchReport> {
  const placement = options.placement ?? "lease_body";
  const segments: ContractSegment[] = segmentContract(source);

  const facts = extractContractFacts(source);

  const findings = await mapConcurrent(segments, options.concurrency ?? DEFAULT_CONCURRENCY, (segment) => {
    const amounts = extractAmounts(segment.text);
    const unitPrice = segment.text.match(UNIT_PRICE_RE);
    const renewal = segment.text.match(RENEWAL_RE);

    // The contract says what MAY be charged, not what WAS. Feeding the stated figure
    // in as `charged_amount_jpy` is what makes a document scan able to answer P3 at
    // all; the report is explicit that these are contract figures, not invoices.
    const chargedFromRent =
      amounts.headlineJpy === null && facts.rentMonthlyJpy !== null && amounts.rentMonths.length > 0
        ? facts.rentMonthlyJpy * Math.max(...amounts.rentMonths)
        : null;

    const evaluation = evaluateClause({
      clause_text: segment.text,
      placement,
      context: {
        prefecture: null,
        layout: null,
        area_sqm: null,
        rent_monthly_jpy: facts.rentMonthlyJpy,
        deposit_jpy: facts.depositJpy,
        charged_amount_jpy: amounts.headlineJpy ?? chargedFromRent,
        tenancy_months: null,
        unit_price_jpy: unitPrice ? toNumber(unitPrice[1]) : null,
        renewal_interval_years: renewal ? toNumber(renewal[1]) : null,
      },
      code: null,
    });
    return {
      index: segment.index,
      label: segmentLabel(segment),
      isTokuyakuSection: segment.isTokuyakuSection,
      text: segment.text,
      start: segment.start,
      end: segment.end,
      amounts,
      evaluation,
    } satisfies ClauseFinding;
  });

  // A segment with no recognised pattern is ordinary contract text (a definitions
  // article, a notice provision). Reporting those as findings would bury the real ones.
  const recognised = findings.filter((f) => f.evaluation.code !== null);
  const skipped = findings.length - recognised.length;

  const verdictCounts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const f of recognised) verdictCounts[f.evaluation.verdict] += 1;

  const adverse = recognised.filter((f) => ADVERSE_VERDICTS.includes(f.evaluation.verdict));
  const pending = recognised.filter((f) => f.evaluation.verdict === "needs_review" && f.amounts.headlineJpy !== null);
  const exposure: FinancialExposure = {
    statedJpy: adverse.reduce((sum, f) => sum + (f.amounts.headlineJpy ?? 0), 0),
    unresolvedJpy: pending.reduce((sum, f) => sum + (f.amounts.headlineJpy ?? 0), 0),
    unresolvedCount: pending.length,
    rentMonths: adverse.reduce((sum, f) => sum + (f.amounts.headlineJpy === null ? f.amounts.rentMonths.reduce((a, b) => a + b, 0) : 0), 0),
    unquantifiedCount: adverse.filter((f) => f.amounts.headlineJpy === null && f.amounts.rentMonths.length === 0).length,
    ambiguousCount: adverse.filter((f) => f.amounts.ambiguous).length,
    caveats: [],
  };
  exposure.caveats.push(
    "契約書に記載された金額の上限値です。実際の請求額ではありません。",
    "「賃料◯か月分」と定められた項目は、賃料額が未入力のため円換算していません。",
  );
  if (exposure.ambiguousCount > 0) {
    exposure.caveats.push(`${exposure.ambiguousCount} 件の条項に複数の金額が記載されており、最大額を採用しています。個別のご確認をお願いします。`);
  }
  if (exposure.unresolvedCount > 0) {
    exposure.caveats.push(`さらに ${exposure.unresolvedCount} 件（計 ${exposure.unresolvedJpy.toLocaleString()} 円）は判定に必要な情報が不足しており、上記金額に含めていません。`);
  }
  if (exposure.unquantifiedCount > 0) {
    exposure.caveats.push(`${exposure.unquantifiedCount} 件の条項は金額の記載がなく、金額に反映されていません。`);
  }

  return {
    totalSegments: segments.length,
    clausesEvaluated: recognised.length,
    clausesSkipped: skipped,
    verdictCounts,
    adverseCount: adverse.length,
    riskLevel: riskLevelOf(verdictCounts),
    exposure,
    findings: recognised,
    advisory: findings[0]?.evaluation.advisory ??
      "Provisional output. Not legal advice, and not fit to be shown to a tenant as a conclusion.",
  };
}
