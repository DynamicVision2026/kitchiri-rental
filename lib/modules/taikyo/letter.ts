/**
 * 原状回復費用に関する確認・再検討申入書 — negotiation letter builder.
 *
 * THIS IS THE ONLY OUTPUT THAT LEAVES THE BUILDING.
 * Everything else in this system is read by the tenant. A letter is read by their
 * landlord, with the tenant's name on it. Three rules follow from that, and they are
 * enforced here rather than left to the caller:
 *
 * 1. IT ASKS, IT DOES NOT ASSERT. Our verdicts are probabilistic — P1, P2 and P4 are
 *    heuristics, and the phrasing throughout is 「〜と理解しております」「ご再検討いただけますと」.
 *    A tenant who sends a demand on the strength of a heuristic and turns out to be
 *    wrong is worse off than one who sent nothing.
 *
 * 2. ONLY VERIFIED AUTHORITY MAY BE CITED. Every citation is gated on the
 *    verification tier recorded in CITATION_REGISTRY. Nothing below
 *    `secondary_source_checked` can appear in outbound correspondence, and the
 *    obscure lower-court and PIO-NET references are excluded entirely — this corpus
 *    has already been caught citing one case for the opposite of its holding, and a
 *    letter is where that costs a real person something.
 *
 * 3. NO VERDICT, NO LETTER. Only adverse verdicts produce one. Asking for a letter
 *    about an `enforceable` or `needs_review` clause returns an explicit refusal with
 *    a reason, never a hedged draft that reads like a finding.
 */

import { phrase, type Locale, type ReasonRef } from "../../phrases/index.ts";
import type { TokuyakuCode, Verdict } from "./taxonomy.ts";

/* ------------------------------------------------------------------ *
 * Outbound citation policy
 * ------------------------------------------------------------------ */

export const CITATION_TIERS = ["primary_source_verified", "secondary_source_checked"] as const;
export type CitationTier = (typeof CITATION_TIERS)[number];

interface RegisteredCitation {
  /** Phrase-bank key holding the sentence. */
  key: string;
  /** How far this authority has actually been checked. */
  tier: CitationTier;
  /** Patterns this citation is relevant to. Empty means all. */
  codes: readonly TokuyakuCode[];
}

/**
 * The authorities approved for outbound correspondence. This is deliberately a short
 * allowlist and not a mirror of the corpus: an authority good enough to calibrate an
 * internal band is not automatically good enough to quote at a landlord.
 *
 * Excluded on purpose: every RETIO and lower-court reference (holdings never
 * established), and all 国民生活センター / PIO-NET material (consultation categories,
 * not authority).
 */
export const CITATION_REGISTRY: readonly RegisteredCitation[] = [
  { key: "cite.civil_621", tier: "secondary_source_checked", codes: [] },
  { key: "cite.h17", tier: "secondary_source_checked", codes: [] },
  { key: "cite.guideline", tier: "secondary_source_checked", codes: [] },
  { key: "cite.shikibiki", tier: "secondary_source_checked", codes: ["TK_SHIKIBIKI", "TK_SHOUKYAKU"] },
];

/**
 * Verdicts that justify writing at all, and the stance each takes.
 *
 * Three stances, not one. A clause we cannot judge is not a clause with nothing to
 * say about it: under art. 621 the burden of showing damage beyond ordinary wear —
 * and what the repair actually cost — sits with the party asserting it. Most 管理会社
 * cannot meet that burden, which makes 立証を求める the section most likely to produce
 * a reduction without escalation. Returning a refusal there, as this builder
 * previously did, threw away the strongest and least confrontational ask available.
 */
export const LETTER_STANCES = ["dispute", "conditional", "demand"] as const;
export type LetterStance = (typeof LETTER_STANCES)[number];

const STANCE_OF: Partial<Record<Verdict, LetterStance>> = {
  unenforceable: "dispute",
  severable: "dispute",
  reducible: "conditional",
  needs_review: "demand",
};

export const LETTERABLE_VERDICTS: readonly Verdict[] =
  (Object.keys(STANCE_OF) as Verdict[]).filter((v) => STANCE_OF[v] !== undefined);

const STANCE_HEADING: Record<LetterStance, string> = {
  dispute: "letter.stance_dispute",
  conditional: "letter.stance_conditional",
  demand: "letter.stance_demand",
};

/** Every phrase key the builder can reference — validate:phrases checks each exists. */
export const LETTER_KEYS: readonly string[] = [
  "letter.subject", "letter.greeting", "letter.intro", "letter.body_lead",
  "letter.record_header", "letter.section_property", "letter.section_clause",
  "letter.section_position", "letter.section_request", "letter.request_itemise",
  "letter.request_reconsider", "letter.request_reply", "letter.closing",
  "letter.complimentary_close", "letter.placeholder_landlord", "letter.placeholder_address",
  "letter.placeholder_name", "letter.placeholder_property", "letter.footer_note",
  "position.unenforceable", "position.severable", "position.reducible", "position.needs_review",
  "letter.stance_dispute", "letter.stance_conditional", "letter.stance_demand",
  "letter.request_evidence",
  ...CITATION_REGISTRY.map((c) => c.key),
];

/* ------------------------------------------------------------------ *
 * Inputs and result
 * ------------------------------------------------------------------ */

export interface LetterClause {
  /** Where the clause sits, e.g. "特約事項 1." */
  label: string;
  clauseText: string;
  verdict: Verdict;
  code: TokuyakuCode | null;
  /** Amount stated in the clause, if any. */
  amountJpy?: number | null;
}

export interface LetterInput {
  clauses: readonly LetterClause[];
  locale?: Locale;
  /** Defaults to today. Injectable so the check script is deterministic. */
  today?: Date;
  landlordName?: string | null;
  tenantName?: string | null;
  tenantAddress?: string | null;
  propertyName?: string | null;
}

export interface LetterResult {
  ok: true;
  text: string;
  /** Which stances the letter actually contains. */
  stances: LetterStance[];
  /** Citations actually included, so the UI can show what the letter leans on. */
  citations: string[];
  /** True while any cited authority is below primary verification. */
  containsUnverifiedCitations: boolean;
  clauseCount: number;
}

export interface LetterRefusal {
  ok: false;
  reason: string;
  /** Clauses that were rejected, with why. */
  rejected: { label: string; verdict: Verdict }[];
}

const p = (key: string, locale: Locale) => phrase({ code: key } satisfies ReasonRef, locale);

function formatDate(d: Date, locale: Locale): string {
  return locale === "ja"
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    : d.toISOString().slice(0, 10);
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

/** Citations relevant to the clauses in this letter, tier-gated and de-duplicated. */
function selectCitations(clauses: readonly LetterClause[]): RegisteredCitation[] {
  const codes = new Set(clauses.map((c) => c.code).filter((c): c is TokuyakuCode => c !== null));
  return CITATION_REGISTRY.filter(
    (c) => c.codes.length === 0 || c.codes.some((code) => codes.has(code)),
  );
}

/**
 * Builds the letter, or refuses. Returns a discriminated union rather than throwing,
 * because "no letter for this clause" is an ordinary answer the UI must render, not
 * an exceptional condition.
 */
export function buildNegotiationLetter(input: LetterInput): LetterResult | LetterRefusal {
  const locale: Locale = input.locale ?? "ja";
  const usable = input.clauses.filter((c) => LETTERABLE_VERDICTS.includes(c.verdict));
  const rejected = input.clauses
    .filter((c) => !LETTERABLE_VERDICTS.includes(c.verdict))
    .map((c) => ({ label: c.label, verdict: c.verdict }));

  if (usable.length === 0) {
    return {
      ok: false,
      reason:
        locale === "ja"
          ? "争点となる条項がありません。判定が「有効の可能性が高い」条項のみの場合、交渉文面は作成しません。根拠のない申入れは、かえって不利に働くことがあります。"
          : "No clause to write about. Where every clause is judged enforceable, no letter is generated: writing without a basis can leave the tenant worse off than not writing.",
      rejected,
    };
  }

  const citations = selectCitations(usable);
  const d = input.today ?? new Date();
  const L: string[] = [];

  L.push(formatDate(d, locale));
  L.push("");
  L.push(`${input.landlordName ?? p("letter.placeholder_landlord", locale)}　御中`);
  L.push("");
  L.push(`　　　　${input.tenantAddress ?? p("letter.placeholder_address", locale)}`);
  L.push(`　　　　${input.tenantName ?? p("letter.placeholder_name", locale)}`);
  L.push("");
  L.push(`　　　　　　${p("letter.subject", locale)}`);
  L.push("");
  L.push(p("letter.greeting", locale));
  L.push("");
  L.push(`　${p("letter.intro", locale)}`);
  L.push("");
  L.push(`　${p("letter.body_lead", locale)}`);
  L.push("");
  L.push(p("letter.record_header", locale));
  L.push("");
  L.push(`1. ${p("letter.section_property", locale)}`);
  L.push(`　　${input.propertyName ?? p("letter.placeholder_property", locale)}`);
  L.push("");

  // Grouped by stance so the landlord reads three distinct asks, not one undifferentiated
  // list: where we disagree, where we want the figure checked, and where we want the
  // records produced.
  const byStance = LETTER_STANCES
    .map((stance) => ({ stance, clauses: usable.filter((c) => STANCE_OF[c.verdict] === stance) }))
    .filter((g) => g.clauses.length > 0);

  let item = 2;
  for (const group of byStance) {
    L.push(`${item}. ${p(STANCE_HEADING[group.stance], locale)}`);
    L.push("");
    group.clauses.forEach((clause, i) => {
      L.push(`　　(${i + 1}) ${p("letter.section_clause", locale)}（${clause.label}）`);
      L.push(`　　　　「${clause.clauseText.replace(/\n/g, " ")}」`);
      if (clause.amountJpy != null) L.push(`　　　　ご請求額（記載額）：${yen(clause.amountJpy)}`);
      L.push(`　　　　${p(`position.${clause.verdict}`, locale)}`);
      L.push("");
    });
    item += 1;
  }

  const requestNo = item;
  L.push(`${requestNo}. ${p("letter.section_request", locale)}`);
  const asks: string[] = [];
  if (byStance.some((g) => g.stance === "demand")) asks.push(p("letter.request_evidence", locale));
  asks.push(p("letter.request_itemise", locale));
  if (byStance.some((g) => g.stance !== "demand")) asks.push(p("letter.request_reconsider", locale));
  asks.push(p("letter.request_reply", locale));
  asks.forEach((a, i) => L.push(`　　(${i + 1}) ${a}`));
  L.push("");

  if (citations.length > 0) {
    L.push(`${requestNo + 1}. ${locale === "ja" ? "参考" : "References"}`);
    for (const c of citations) L.push(`　　・${p(c.key, locale)}`);
    L.push("");
  }

  L.push(`　${p("letter.closing", locale)}`);
  L.push("");
  L.push(`　　　　　　　　　　　　　　　　　　　　${p("letter.complimentary_close", locale)}`);
  L.push("");
  L.push("---");
  L.push(p("letter.footer_note", locale));

  return {
    ok: true,
    text: L.join("\n"),
    stances: byStance.map((g) => g.stance),
    citations: citations.map((c) => c.key),
    containsUnverifiedCitations: citations.some((c) => c.tier !== "primary_source_verified"),
    clauseCount: usable.length,
  };
}
