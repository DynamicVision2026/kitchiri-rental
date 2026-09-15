/**
 * Fixtures for the taikyo funnel.
 *
 * Every screen is built against these, including the paid and post-payment states,
 * so wiring V13's persistence and payment is a swap of the data source rather than a
 * rebuild of the view. Shapes deliberately mirror the engine's own types.
 */

export type DemoTier = "contestable" | "conditional" | "demand" | "sound";

export interface DemoLine {
  id: string;
  label: string;          // 費目
  clause: string;         // the clause text, for S2 confirm
  chargedJpy: number;
  tier: DemoTier;
  /** Masked on the free result. */
  reasoning: string;
  citation: { text: string; tier: "primary" | "secondary" | "unverified" };
  /** Extraction confidence, drives the S2 "check this one" treatment. */
  confidence: "high" | "low";
}

export const DEMO_LINES: DemoLine[] = [
  {
    id: "L1", label: "クロス張替え（居室全面）",
    clause: "退去時のクロス（壁紙）張替えについては、経過年数や耐用年数にかかわらず、居室全面を借主負担で張り替えるものとする。",
    chargedJpy: 62000, tier: "contestable", confidence: "high",
    reasoning: "入居期間の長短にかかわらず全面張替えを負担させる内容です。民法621条は経年変化を原状回復義務の対象から除いており、説明と合意の記録もないため、この条項で負担区分を動かすことは難しいと考えられます。",
    citation: { text: "最判平成17年12月16日", tier: "secondary" },
  },
  {
    id: "L2", label: "ハウスクリーニング費用",
    clause: "退去時のハウスクリーニング費用として、賃借人は金35,000円を負担するものとする。",
    chargedJpy: 15000, tier: "sound", confidence: "high",
    reasoning: "金額が契約書に明記され、間取りに対する一般的な水準の範囲内です。負担を求められる可能性が高い項目です。",
    citation: { text: "国土交通省 原状回復ガイドライン（再改訂版）", tier: "secondary" },
  },
  {
    id: "L3", label: "室内消毒施工費",
    clause: "室内消毒施工費として、賃借人は金25,000円を負担するものとする。",
    chargedJpy: 25000, tier: "conditional", confidence: "high",
    reasoning: "条項の効力自体は争いにくいものの、同種の施工として一般に見られる水準を上回っています。金額の根拠の提示と減額を求める余地があります。",
    citation: { text: "消費者契約法10条", tier: "secondary" },
  },
  {
    id: "L4", label: "フローリング補修",
    clause: "フローリングに生じたキズ・へこみについては、原因を問わず退去時に借主負担で補修するものとする。",
    chargedJpy: 18000, tier: "demand", confidence: "low",
    reasoning: "通常損耗にあたる部分と、ご自身の過失による毀損とを切り分ける必要があります。入居時の状態を示す記録と施工の内訳が示されていないため、現時点では負担すべき範囲を判断できません。民法621条のもとでは、これらを示すのは請求する側と理解されます。",
    citation: { text: "民法621条", tier: "secondary" },
  },
  {
    id: "L5", label: "鍵交換費用",
    clause: "退去時の鍵交換費用として、賃借人は金22,000円を負担するものとする。",
    chargedJpy: 22000, tier: "sound", confidence: "high",
    reasoning: "金額が契約書に明記され、一般的な水準の範囲内です。負担を求められる可能性が高い項目です。",
    citation: { text: "国土交通省 原状回復ガイドライン（再改訂版）", tier: "secondary" },
  },
];

export const DEMO_TOTAL = DEMO_LINES.reduce((n, l) => n + l.chargedJpy, 0);
export const demoByTier = (t: DemoTier) => DEMO_LINES.filter((l) => l.tier === t);
export const demoSum = (t: DemoTier) => demoByTier(t).reduce((n, l) => n + l.chargedJpy, 0);
/**
 * What the headline may claim.
 *
 * Deliberately EXCLUDES the 立証を求める tier. Those lines are unknown — that is what
 * the tier means — and folding them into a number a tenant may quote at a 管理会社
 * would be claiming what we have said we cannot determine. Reducible lines are
 * included because the clause is conceded and only the figure is in dispute, which
 * is a claim we can stand behind.
 */
export const DEMO_RECOVERABLE = demoSum("contestable") + demoSum("conditional");

/** The 妥当 case: nothing contestable, no paywall, full reasoning shown free. */
export const DEMO_SOUND_ONLY: DemoLine[] = [
  { ...DEMO_LINES[1] },
  {
    ...DEMO_LINES[2], id: "S2", chargedJpy: 14000, tier: "sound",
    reasoning: "金額が明記され、一般的な水準の範囲内です。負担を求められる可能性が高い項目です。",
  },
];

export const SKUS = [
  { id: "taikyo", name: "退去費用チェック", priceJpy: 3980, primary: true,
    note: "この診断の全項目・根拠・文面一式" },
  { id: "nyukyo", name: "初期費用チェック", priceJpy: 1980, primary: false,
    note: "入居時の初期費用のみ" },
  { id: "pack", name: "入居〜退去パック", priceJpy: 4980, primary: false,
    note: "入居時に確認し、退去時に同じ契約書で再判定" },
];

export const DELIVERABLES = [
  "項目ごとの金額と、そう判定した理由",
  "根拠とした法令・判例（検証状況つき）",
  "貸主・管理会社あての文面（争う／条件付き／立証を求める）",
  "PDF での書き出し",
];

export const PAYMENT_METHODS = ["クレジットカード", "PayPay", "コンビニ払い"];
