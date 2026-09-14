/**
 * Fact-loop convergence check.  npm run eval:factloop
 *
 * Starts every golden-set clause COLD — clause text only, no placement, no figures —
 * then answers whatever the engine asks for, using that entry's own recorded facts as
 * the stand-in for a user, and re-evaluates. It measures the thing that actually
 * matters for the flow: does asking questions terminate, and does it end somewhere
 * decisive, or does the engine ask forever and still say "needs_review"?
 *
 * A question the corpus cannot answer counts as a STALL, not a pass. Those are the
 * cases where a real user would be left holding an unanswered form.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { corpusSchema, type ClauseContext } from "../../lib/modules/taikyo/taxonomy.ts";
import { evaluateClause, type EvaluateInput, type Placement } from "../../lib/modules/taikyo/rules.ts";

const corpus = corpusSchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("./taikyo-corpus.json", import.meta.url)), "utf8")),
);

const MAX_ROUNDS = 6;
let converged = 0, stalled = 0, coldDecisive = 0;
let totalRounds = 0;
const stalls: string[] = [];

for (const entry of corpus.cases) {
  const req: EvaluateInput = { clause_text: entry.clause_text, placement: "unknown", context: null, code: null };
  let rounds = 0;
  let evaluation = evaluateClause(req);
  if (evaluation.verdict !== "needs_review") coldDecisive += 1;

  while (evaluation.verdict === "needs_review" && rounds < MAX_ROUNDS) {
    const asks = evaluation.missingFacts;
    if (asks.length === 0) break; // nothing more to ask, still undecided
    let answeredSomething = false;

    for (const ask of asks) {
      if (ask.path === "placement") {
        const p2 = entry.expected_prongs.P2;
        if (p2 === "unknown") continue;
        req.placement = (p2 ? "lease_body" : "explanatory_document") satisfies Placement;
        answeredSomething = true;
      } else if (ask.path === "declared.amount_fixed_in_contract") {
        const p1 = entry.expected_prongs.P1;
        if (p1 === "unknown") continue;
        req.declared = { amount_fixed_in_contract: p1 };
        answeredSomething = true;
      } else if (ask.path.startsWith("context.")) {
        const key = ask.path.slice("context.".length) as keyof ClauseContext;
        const value = entry.context?.[key];
        if (value === null || value === undefined) continue;
        req.context = { ...(req.context ?? (entry.context as ClauseContext)) };
        (req.context as Record<string, unknown>)[key] = value;
        answeredSomething = true;
      }
    }
    if (!answeredSomething) break;
    rounds += 1;
    evaluation = evaluateClause(req);
  }

  totalRounds += rounds;
  if (evaluation.verdict !== "needs_review") converged += 1;
  else {
    stalled += 1;
    stalls.push(
      `  ${entry.id} ${entry.expected_code.padEnd(14)} still needs: ` +
        (evaluation.missingFacts.map((f) => f.id).join(", ") || "(nothing asked, still undecided)"),
    );
  }
}

const n = corpus.cases.length;
const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
console.log(`fact-loop convergence — ${n} clauses, cold start\n`);
console.log(`  decisive with clause text alone   ${pct(coldDecisive)}  (${coldDecisive}/${n})`);
console.log(`  decisive after answering          ${pct(converged)}  (${converged}/${n})`);
console.log(`  stalled                           ${pct(stalled)}  (${stalled}/${n})`);
console.log(`  average question rounds           ${(totalRounds / n).toFixed(2)}`);
if (stalls.length) { console.log("\nstalls (a real user would be stuck here):"); for (const s of stalls) console.log(s); }
