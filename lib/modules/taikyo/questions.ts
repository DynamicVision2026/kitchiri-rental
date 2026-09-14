/**
 * 原状回復 — turning an unknown prong into a question a tenant can actually answer.
 *
 * The engine returns "unknown" whenever it cannot honestly decide a prong. That is
 * the right answer, but on its own it is a dead end for a user. This module converts
 * each unknown into the specific missing fact behind it, so the flow can ask for that
 * fact and nothing else.
 *
 * Two rules keep the questioning honest:
 *   - Never ask for a legal conclusion. Ask where a term appears, or what was
 *     charged. "Is this clause specific enough?" is our job, not the tenant's.
 *   - Only ask what would actually change the answer. A pattern with no numeric band
 *     is never asked for rent, and a fact already supplied is never asked twice.
 */

import {
  TOKUYAKU_PATTERNS,
  type ProngId,
  type ProngScores,
  type TokuyakuCode,
  type ClauseContext,
} from "./taxonomy.ts";

export const ANSWER_KINDS = ["choice", "number", "boolean"] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

export interface AnswerOption {
  value: string;
  labelJa: string;
  labelEn: string;
}

export interface FactRequest {
  /** Stable key, safe to use as a React key or an analytics event name. */
  id: string;
  /** Which prong(s) this unblocks — lets the UI explain why it is asking. */
  unblocks: readonly ProngId[];
  /**
   * Where the answer belongs in the next evaluate request, as a dot path:
   * "placement", "declared.<key>" or "context.<key>". Apply it with
   * `applyAnswer` from lib/shared/taikyo-client.ts.
   */
  path: string;
  kind: AnswerKind;
  questionJa: string;
  questionEn: string;
  /** Shown under the field. Explains why the answer matters, in plain language. */
  helpJa: string;
  options?: readonly AnswerOption[];
  /** Unit suffix for a number input, e.g. 円. */
  unit?: string;
}

const PLACEMENT_QUESTION: FactRequest = {
  id: "placement",
  unblocks: ["P2"],
  path: "placement",
  kind: "choice",
  questionJa: "この条項は、どの書面に記載されていましたか？",
  questionEn: "Which document did this clause appear in?",
  helpJa:
    "契約書本体または署名した特約書面に記載されていれば合意されたものと扱われます。入居後に渡された書面にしか記載がない場合、契約上の負担とは認められない可能性があります。",
  options: [
    { value: "lease_body", labelJa: "賃貸借契約書の本体", labelEn: "The lease itself" },
    { value: "signed_rider", labelJa: "署名・押印した特約書面", labelEn: "A signed rider" },
    { value: "explanatory_document", labelJa: "重要事項説明書のみ", labelEn: "Only the explanatory document" },
    { value: "house_rules", labelJa: "入居のしおり・管理規約のみ", labelEn: "Only house rules / handbook" },
  ],
};

const AMOUNT_FIXED_QUESTION: FactRequest = {
  id: "amount_fixed_in_contract",
  unblocks: ["P1"],
  path: "declared.amount_fixed_in_contract",
  kind: "boolean",
  questionJa: "契約書または別紙に、この費用の金額または単価が具体的に記載されていますか？",
  questionEn: "Does the contract or an attached schedule state a specific amount or unit price for this?",
  helpJa:
    "条項そのものに金額が書かれていなくても、別紙の負担表などに単価が定められている場合があります。金額が特定されていないと、負担する範囲を知らないまま合意したことになり、特約の効力が否定されやすくなります。",
};

const LAYOUT_QUESTION: FactRequest = {
  id: "layout",
  unblocks: ["P3"],
  path: "context.layout",
  kind: "choice",
  questionJa: "お部屋の間取りを教えてください。",
  questionEn: "What is the layout of the unit?",
  helpJa: "清掃費用の相場は広さによって変わるため、間取りがないと金額の妥当性を判断できません。",
  options: [
    { value: "1R/1K", labelJa: "1R / 1K", labelEn: "1R / 1K" },
    { value: "1DK/1LDK", labelJa: "1DK / 1LDK", labelEn: "1DK / 1LDK" },
    { value: "2DK/2LDK", labelJa: "2DK / 2LDK", labelEn: "2DK / 2LDK" },
    { value: "3DK/3LDK", labelJa: "3DK / 3LDK", labelEn: "3DK / 3LDK" },
    { value: "4LDK+", labelJa: "4LDK 以上", labelEn: "4LDK or larger" },
  ],
};

function numberQuestion(
  id: string,
  key: keyof ClauseContext,
  questionJa: string,
  questionEn: string,
  helpJa: string,
  unit: string,
): FactRequest {
  return { id, unblocks: ["P3"], path: `context.${key}`, kind: "number", questionJa, questionEn, helpJa, unit };
}

const RENT = numberQuestion(
  "rent_monthly_jpy", "rent_monthly_jpy",
  "月額賃料はいくらですか？", "What is the monthly rent?",
  "敷引・更新料・違約金の相当性は、賃料の何か月分にあたるかで判断されます。",
  "円",
);
const CHARGED = numberQuestion(
  "charged_amount_jpy", "charged_amount_jpy",
  "この項目で請求された（または控除された）金額はいくらですか？", "How much were you charged or deducted for this item?",
  "実際の請求額がないと、相当な範囲に収まっているかを計算できません。",
  "円",
);
const UNIT_PRICE = numberQuestion(
  "unit_price_jpy", "unit_price_jpy",
  "単価はいくらと定められていますか？（1㎡あたり、または畳1枚あたり）", "What unit price is specified (per ㎡, or per tatami mat)?",
  "クロス・床・畳は、請求総額ではなく単価で妥当性を判断します。広い部屋の高額な請求が、それだけで不当になるわけではないためです。",
  "円",
);
const RENEWAL = numberQuestion(
  "renewal_interval_years", "renewal_interval_years",
  "契約の更新は何年ごとですか？", "How many years between renewals?",
  "更新料は「更新1年あたり賃料の何か月分か」に換算して判断します。2年更新と1年更新では負担が倍違うためです。",
  "年",
);

/** Which context fields each band needs before P3 can be computed. */
const BAND_INPUTS: Partial<Record<TokuyakuCode, readonly FactRequest[]>> = {
  TK_SHIKIBIKI: [RENT, CHARGED],
  TK_SHOUKYAKU: [RENT, CHARGED],
  TK_TANKI: [RENT, CHARGED],
  TK_KOSHIN: [RENT, CHARGED, RENEWAL],
  TK_CLEAN: [LAYOUT_QUESTION, CHARGED],
  TK_KAGI: [CHARGED],
  TK_SHOUDOKU: [CHARGED],
  TK_TATAMI: [UNIT_PRICE],
  TK_CROSS: [UNIT_PRICE],
  TK_FLOOR: [UNIT_PRICE],
};

function alreadyAnswered(path: string, context: ClauseContext | null, placementKnown: boolean): boolean {
  if (path === "placement") return placementKnown;
  if (!path.startsWith("context.")) return false;
  if (context === null) return false;
  const key = path.slice("context.".length) as keyof ClauseContext;
  const value = context[key];
  return value !== null && value !== undefined;
}

/**
 * The facts still missing, in the order worth asking them. Placement first because it
 * can settle the whole clause on its own; money last because it is the most work for
 * the user to look up.
 */
export function deriveFactRequests(args: {
  code: TokuyakuCode | null;
  prongs: ProngScores;
  context: ClauseContext | null;
  placementKnown: boolean;
  amountDeclared: boolean;
}): FactRequest[] {
  const { code, prongs, context, placementKnown, amountDeclared } = args;
  if (code === null) return [];

  const out: FactRequest[] = [];
  if (prongs.P2 === "unknown" && !placementKnown) out.push(PLACEMENT_QUESTION);
  if (prongs.P1 === "unknown" && !amountDeclared) out.push(AMOUNT_FIXED_QUESTION);

  if (prongs.P3 === "unknown" && TOKUYAKU_PATTERNS[code].bandKey !== null) {
    for (const q of BAND_INPUTS[code] ?? []) {
      if (!alreadyAnswered(q.path, context, placementKnown)) out.push(q);
    }
  }

  // De-duplicate: the same field can be reached by more than one route.
  const seen = new Set<string>();
  return out.filter((q) => (seen.has(q.path) ? false : (seen.add(q.path), true)));
}
