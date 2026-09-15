/**
 * Span-grounded prong verification (Addendum A §A4).
 *
 * The rule: a prong may only be asserted if whoever asserted it can point at the
 * exact substring of the clause that supports it, and TypeScript can re-check that
 * substring independently. A prong whose span fails verification is forced to
 * `unknown` — never to the asserted value. The asserter may be wrong; it may not be
 * wrong AND unchecked.
 *
 * WHAT THIS GUARDS IN THIS CODEBASE, TODAY
 * ----------------------------------------
 * There is no model in this pipeline. Classification is deterministic regex, so a
 * span-check on our own output cannot catch a hallucination — there is none to
 * catch. What it does catch, and what made it worth building now:
 *
 *   - a regex that matched something other than what its prong claims (an `amount`
 *     signal firing on text containing no numeral, because the pattern drifted)
 *   - a prong asserted from no evidence at all, which the type system now makes
 *     impossible to express: an asserted prong carries a span or it is unknown
 *   - and, the reason it is built ahead of need: any future extraction pass —
 *     a model, an OCR layer, a third-party parser — arrives behind this gate
 *     rather than in front of it. `verifyClaimedProngs` is the seam for exactly
 *     that, and it is tested against a fabricated claim today.
 *
 * Only text-derived prongs are in scope. P2 (所在) comes from the user telling us
 * which document a term appeared in; P3 (相当性) is arithmetic over supplied figures.
 * Neither is a claim about the clause's wording, so neither has a span to verify,
 * and demanding one would be theatre.
 */

export const PRONG_KINDS = [
  "amount",      // a figure, rate, or determinate formula is stated
  "scope",       // the work or item being charged for is identified
  "assent",      // explanation to, or agreement by, the tenant is recorded
  "disclaimer",  // cost shifted irrespective of occupancy, age or wear
  "deferral",    // scope or amount left to be fixed later
  "performance", // the charge accrues whether or not work is done
  "wear_shift",  // ordinary wear or aging assigned to the tenant in terms
  "notice_period", // a notice window running alongside a penalty
] as const;
export type ProngKind = (typeof PRONG_KINDS)[number];

export interface VerifiedSpan {
  text: string;
  start: number;
  kind: ProngKind;
}

/** Words that identify WHAT is being charged for, for the `scope` check. */
export const SCOPE_LEXICON: readonly string[] = [
  "クリーニング", "清掃", "クロス", "壁紙", "フローリング", "床材", "クッションフロア",
  "畳", "表替え", "襖", "障子", "鍵", "シリンダー", "錠前", "消毒", "除菌", "抗菌", "消臭",
  "張替え", "張り替え", "補修", "交換", "立会", "書類", "精算", "作成", "施工", "リフォーム",
  "コーティング", "敷引", "償却", "更新料", "違約金", "原状回復", "手数料",
];

/** Does this text carry a figure? Exported so callers can pick the right prong kind. */
export function hasNumeral(text: string): boolean {
  return NUMERAL.test(text);
}

/** A numeral in any form a Japanese lease uses. */
const NUMERAL = /[0-9０-９]|[一二三四五六七八九十百千万]/;
const ASSENT_LEXICON = ["説明", "読み上げ", "署名", "記名", "押印", "同意", "承諾"];
const DISCLAIMER_LEXICON = ["かかわらず", "関わらず", "問わず", "問わない", "考慮せず", "考慮しない"];
const DEFERRAL_LEXICON = ["指定", "決定", "定め", "別途", "後日", "事後", "実費", "管理規約"];
const PERFORMANCE_LEXICON = ["実施", "施工", "履行", "作業"];
const WEAR_LEXICON = ["通常損耗", "経年変化", "経年劣化", "自然損耗", "通常の使用"];
const NOTICE_LEXICON = ["予告", "申出", "申し出", "通知"];

/**
 * Re-checks one asserted span against the clause it came from.
 *
 * Returns null — meaning "force this prong to unknown" — rather than throwing,
 * because a failed verification is an ordinary outcome that must degrade the
 * verdict, not an exception that loses the whole evaluation.
 */
export function verifySpan(span: string, clause: string, kind: ProngKind): VerifiedSpan | null {
  const text = span.trim();
  if (text.length === 0) return null;

  // 1. It must actually be in the clause, verbatim. This is the check that makes a
  //    fabricated quotation impossible to pass.
  const start = clause.indexOf(text);
  if (start < 0) return null;

  // 2. It must be the KIND of thing the prong claims. A span asserting an amount and
  //    containing no numeral is discarded even though it is genuinely present in the
  //    clause: quoting real text is necessary, not sufficient.
  switch (kind) {
    case "amount":
      if (!NUMERAL.test(text)) return null;
      break;
    case "scope":
      if (!SCOPE_LEXICON.some((w) => text.includes(w))) return null;
      break;
    case "assent":
      if (!ASSENT_LEXICON.some((w) => text.includes(w))) return null;
      break;
    case "disclaimer":
      if (!DISCLAIMER_LEXICON.some((w) => text.includes(w))) return null;
      break;
    case "deferral":
      if (!DEFERRAL_LEXICON.some((w) => text.includes(w))) return null;
      break;
    case "performance":
      if (!PERFORMANCE_LEXICON.some((w) => text.includes(w))) return null;
      break;
    case "wear_shift":
      if (!WEAR_LEXICON.some((w) => text.includes(w))) return null;
      break;
    case "notice_period":
      if (!NOTICE_LEXICON.some((w) => text.includes(w))) return null;
      break;
  }
  return { text, start, kind };
}

/**
 * An untrusted upstream assertion about a prong: "P1 is true, and here is the
 * substring that proves it". Shaped for a model or parser that does not exist yet,
 * and verified by the same function that checks our own signals — so a future
 * extraction pass cannot bypass the gate by arriving through a different door.
 */
export interface ClaimedProngSpan {
  kind: ProngKind;
  span: string;
}

export interface SpanVerdict {
  verified: VerifiedSpan | null;
  /** Why it failed, for the audit trail. Null when it passed. */
  rejectedBecause: "not_in_clause" | "wrong_kind" | "empty" | null;
}

export function verifyClaim(claim: ClaimedProngSpan, clause: string): SpanVerdict {
  const text = claim.span.trim();
  if (text.length === 0) return { verified: null, rejectedBecause: "empty" };
  if (!clause.includes(text)) return { verified: null, rejectedBecause: "not_in_clause" };
  const verified = verifySpan(text, clause, claim.kind);
  return verified ? { verified, rejectedBecause: null } : { verified: null, rejectedBecause: "wrong_kind" };
}
