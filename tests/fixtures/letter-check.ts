/**
 * Negotiation letter check.  npm run eval:letter
 *
 * The letter is the only artefact a landlord reads, so these assertions are about
 * restraint as much as correctness: it must refuse when there is nothing to dispute,
 * it must never assert more than our evidence supports, and it must never quote an
 * authority that has not been checked.
 */
import { buildNegotiationLetter, CITATION_REGISTRY, LETTERABLE_VERDICTS } from "../../lib/modules/taikyo/letter.ts";

const failures: string[] = [];
const expect = (c: boolean, m: string) => { if (!c) failures.push(m); };
const TODAY = new Date("2026-09-14T00:00:00Z");

// 1. An adverse clause produces a letter.
const drafted = buildNegotiationLetter({
  today: TODAY,
  clauses: [{
    label: "特約事項 2.",
    clauseText: "退去時のクロス（壁紙）張替えについては、経過年数や耐用年数にかかわらず、居室全面を借主負担で張り替えるものとする。",
    verdict: "unenforceable",
    code: "TK_CROSS",
    amountJpy: 165000,
  }],
});
expect(drafted.ok, "an unenforceable clause must produce a letter");
if (drafted.ok) {
  console.log("--- drafted letter ---\n");
  console.log(drafted.text);
  console.log("\n--- end ---\n");
  expect(drafted.text.includes("民法第621条"), "the statute must be quoted");
  expect(drafted.text.includes("最高裁平成17年12月16日"), "the 特約 requirements case must be cited");
  expect(!/RETIO|国民生活センター|PIO-NET/.test(drafted.text), "unverified/obscure sources must never reach a letter");
  expect(drafted.text.includes("理解しております"), "the letter must be phrased as understanding, not assertion");
  expect(!/無効です|支払いません|法的措置/.test(drafted.text), "the letter must not assert invalidity or threaten");
  expect(drafted.containsUnverifiedCitations, "must flag that citations are not primary-source verified");
  expect(drafted.text.includes("165,000円"), "the stated amount must appear");
}

// 2. A clause with nothing wrong produces a refusal, not a hedged draft.
for (const verdict of ["enforceable", "needs_review"] as const) {
  const refused = buildNegotiationLetter({
    today: TODAY,
    clauses: [{ label: "特約事項 4.", clauseText: "鍵交換費用として金18,000円を負担する。", verdict, code: "TK_KAGI", amountJpy: 18000 }],
  });
  expect(!refused.ok, `${verdict} must not produce a letter`);
  if (!refused.ok) expect(refused.rejected.length === 1, `${verdict} refusal must name the rejected clause`);
}

// 3. Mixed input keeps only the disputable clauses.
const mixed = buildNegotiationLetter({
  today: TODAY,
  clauses: [
    { label: "A", clauseText: "無効と思われる条項。", verdict: "unenforceable", code: "TK_TSUJO", amountJpy: null },
    { label: "B", clauseText: "問題のない条項。", verdict: "enforceable", code: "TK_KAGI", amountJpy: 18000 },
    { label: "C", clauseText: "金額が高すぎる条項。", verdict: "reducible", code: "TK_SHOUDOKU", amountJpy: 42000 },
  ],
});
expect(mixed.ok && mixed.clauseCount === 2, "only the two disputable clauses belong in the letter");
if (mixed.ok) expect(!mixed.text.includes("問題のない条項"), "an enforceable clause leaked into the letter");

// 4. Shikibiki pulls in its own citation; an unrelated pattern does not.
const shiki = buildNegotiationLetter({
  today: TODAY,
  clauses: [{ label: "第4条", clauseText: "敷引金として金600,000円を控除する。", verdict: "reducible", code: "TK_SHIKIBIKI", amountJpy: 600000 }],
});
expect(shiki.ok && shiki.citations.includes("cite.shikibiki"), "a shikibiki clause must cite the shikibiki authority");
expect(drafted.ok && !drafted.citations.includes("cite.shikibiki"), "a cross clause must not cite the shikibiki authority");

// 5. Every registered citation is at least secondary-checked.
expect(CITATION_REGISTRY.every((c) => c.tier === "primary_source_verified" || c.tier === "secondary_source_checked"),
  "an unverified authority is registered for outbound use");
expect(!LETTERABLE_VERDICTS.includes("enforceable") && !LETTERABLE_VERDICTS.includes("needs_review"),
  "only adverse verdicts may be letterable");

if (failures.length) {
  for (const f of failures) console.error(`  FAIL: ${f}`);
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("OK");
