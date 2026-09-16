/**
 * Maps the engine's real output (BatchFinding, from batch-evaluate) onto the
 * DemoLine shape the V14 screens (Screens.tsx) render — the swap V14's fixtures
 * anticipated. Every field below is a documented, non-fabricated derivation from the
 * engine's own data; nothing here invents a number or a verification status the
 * engine did not actually produce.
 */

import type { DemoLine, DemoTier } from "@/lib/fixtures/taikyo-demo.ts";
import type { ClauseFinding, Verdict } from "@/lib/shared/taikyo-client.ts";

/**
 * The fields toDemoLine() actually reads — deliberately narrower than the full
 * BatchFinding (label + resolved reasonsText), so it accepts both the client-side
 * BatchFinding (from batch-evaluate, reasonsText already resolved) and the raw
 * server-side ClauseFinding (from calling evaluateContract() directly, as
 * /taikyo/sample and scripts/dev-seed-paid-audit.ts both do) without forcing an
 * unnecessary phrase-resolution pass for a value this function never uses.
 */
type FindingLike = Pick<ClauseFinding, "index" | "label" | "text" | "amounts" | "evaluation">;

/** Mirrors the stance grouping in lib/modules/taikyo/letter.ts's STANCE_OF, plus a
 *  fourth bucket ("sound") for verdicts that cost the tenant nothing. */
const TIER_OF_VERDICT: Record<Verdict, DemoTier> = {
  unenforceable: "contestable",
  severable: "contestable",
  reducible: "conditional",
  needs_review: "demand",
  enforceable: "sound",
};

export function verdictToTier(verdict: Verdict): DemoTier {
  return TIER_OF_VERDICT[verdict];
}

/**
 * The engine does not track a per-clause citation verification tier at evaluation
 * time — only the golden-set corpus does, offline, via VERIFICATION_STATUSES
 * (lib/modules/taikyo/taxonomy.ts). Every live authority is therefore honestly
 * "unverified" here rather than borrowing a tier a live evaluation never computed.
 * See legal/manifest.json for the actual verification state of each authority.
 */
export function toDemoLine(finding: FindingLike): DemoLine {
  const tier = verdictToTier(finding.evaluation.verdict);
  return {
    id: String(finding.index),
    label: finding.label,
    clause: finding.text,
    chargedJpy: finding.amounts.headlineJpy ?? 0,
    tier,
    reasoning: finding.evaluation.remedy.tenantMessageJa,
    citation: {
      text: finding.evaluation.authorities.length > 0 ? finding.evaluation.authorities.join(" ／ ") : "根拠なし",
      tier: "unverified",
    },
    confidence: finding.amounts.ambiguous || finding.amounts.headlineJpy === null ? "low" : "high",
  };
}

export function sumsByTier(lines: DemoLine[]): Record<DemoTier, number> {
  const sums: Record<DemoTier, number> = { contestable: 0, conditional: 0, demand: 0, sound: 0 };
  for (const l of lines) sums[l.tier] += l.chargedJpy;
  return sums;
}

/**
 * What the free headline figure may claim. Mirrors DEMO_RECOVERABLE's own rule
 * (lib/fixtures/taikyo-demo.ts): contestable + conditional only. The "demand" tier
 * (立証を求める) is deliberately excluded — those lines are unresolved, and folding
 * them into a number a tenant might quote at a 管理会社 would claim what the engine
 * has explicitly said it cannot determine.
 */
export function recoverableTotal(sums: Record<DemoTier, number>): number {
  return sums.contestable + sums.conditional;
}
