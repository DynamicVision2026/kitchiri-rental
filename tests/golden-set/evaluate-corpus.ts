/**
 * Scorecard: runs the rules engine over every golden-set entry and reports how far
 * it reproduces the labels.  npm run eval:corpus
 *
 * This is a REPORT, not a gate. `validate:corpus` guards the corpus; this measures
 * the engine against it, and the engine is a scaffold whose P1/P2/P4 heuristics are
 * expected to fall short. Gating the build on it would either block work or tempt
 * someone to weaken the corpus to make the engine look good.
 *
 * Placement is fed in from each entry's own P2 label, because the corpus records
 * where the term sits in prose rather than as a field. That makes P2 agreement
 * uninformative by construction — it is reported, and discounted, below.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRONG_IDS, corpusSchema, type ProngId } from "../../lib/modules/taikyo/taxonomy.ts";
import { evaluateClause, type Placement } from "../../lib/modules/taikyo/rules.ts";

const corpus = corpusSchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("./taikyo-corpus.json", import.meta.url)), "utf8")),
);

/**
 * The two failure directions are not equally bad, so they are never summed.
 *
 *   false_valid   — we said 有効 where the corpus says the clause is contestable.
 *                   The tenant pays something they need not have paid. Their money.
 *   false_adverse — we said 争う where the corpus says the clause holds. A wrong
 *                   assertion goes into a letter handed to a 管理会社. Our
 *                   credibility, the tenant's position, our legal exposure.
 *
 * needs_review is neither: abstention is the designed safe answer and is counted
 * separately rather than punished as an error.
 *
 * The composite weights false_adverse 5x, because the cost is not the tenant's to
 * bear and is not recoverable by them. The weight is a judgement, stated here so it
 * can be argued with rather than buried in an average.
 */
const W_FALSE_VALID = 1;
const W_FALSE_ADVERSE = 5;
const ADVERSE = new Set(["unenforceable", "severable", "reducible"]);

let falseValid = 0;
let falseAdverse = 0;
let abstained = 0;
let overconfident = 0;
const overconfidentCases: string[] = [];
const falseValidCases: string[] = [];
const falseAdverseCases: string[] = [];

let classifiedTop = 0;
let classifiedInTop3 = 0;
let verdictExact = 0;
let verdictSafe = 0; // engine said needs_review where the corpus was decisive
const prongHits: Record<ProngId, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
const prongUnknown: Record<ProngId, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
const misses: string[] = [];

for (const entry of corpus.cases) {
  const placement: Placement =
    entry.expected_prongs.P2 === true ? "lease_body" : entry.expected_prongs.P2 === false ? "explanatory_document" : "unknown";

  const blind = evaluateClause({
    clause_text: entry.clause_text,
    placement,
    context: entry.context,
    code: null,
  });
  if (blind.classification.chosen === entry.expected_code) classifiedTop += 1;
  if (blind.classification.candidates.slice(0, 3).some((c) => c.code === entry.expected_code)) classifiedInTop3 += 1;

  // Prong and verdict accuracy are measured with the code GIVEN, so a
  // classification miss is not double-counted as a reasoning failure.
  const withCode = evaluateClause({
    clause_text: entry.clause_text,
    placement,
    context: entry.context,
    code: entry.expected_code,
  });

  for (const id of PRONG_IDS) {
    if (withCode.prongs[id] === entry.expected_prongs[id]) prongHits[id] += 1;
    if (withCode.prongs[id] === "unknown") prongUnknown[id] += 1;
  }
  if (withCode.verdict === entry.expected_verdict) verdictExact += 1;
  else if (withCode.verdict === "needs_review") verdictSafe += 1;
  else misses.push(`${entry.id} ${entry.expected_code}: expected ${entry.expected_verdict}, engine said ${withCode.verdict}`);

  // Direction of failure, which is the number that actually matters.
  const truthAdverse = ADVERSE.has(entry.expected_verdict);
  const saidAdverse = ADVERSE.has(withCode.verdict);
  if (withCode.verdict === "needs_review") {
    if (entry.expected_verdict !== "needs_review") abstained += 1;
  } else if (truthAdverse && !saidAdverse) {
    falseValid += 1;
    falseValidCases.push(`${entry.id} ${entry.expected_code}: truth ${entry.expected_verdict}, engine 有効 — tenant would pay`);
  } else if (entry.expected_verdict === "needs_review") {
    // The corpus itself abstains — an unresolved citation, or facts too thin. The
    // engine deciding anyway is overconfidence, but it is NOT the same failure as
    // calling a sound clause contestable, and folding them together would hide both.
    overconfident += 1;
    overconfidentCases.push(`${entry.id} ${entry.expected_code}: corpus abstains, engine said ${withCode.verdict}`);
  } else if (!truthAdverse && saidAdverse) {
    falseAdverse += 1;
    falseAdverseCases.push(`${entry.id} ${entry.expected_code}: truth ${entry.expected_verdict}, engine ${withCode.verdict} — would enter a letter`);
  }
}

const n = corpus.cases.length;
const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`.padStart(4);

console.log(`taikyo engine scorecard — ${n} golden-set entries\n`);
console.log("classification (blind, no code supplied)");
console.log(`  top-1 correct      ${pct(classifiedTop)}  (${classifiedTop}/${n})`);
console.log(`  correct in top-3   ${pct(classifiedInTop3)}  (${classifiedInTop3}/${n})`);
console.log("\nprong agreement (code supplied)");
for (const id of PRONG_IDS) {
  const note = id === "P2" ? "  <- fed from the label; not a real measure" : id === "P3" ? "  <- computed, not heuristic" : "";
  console.log(`  ${id}  ${pct(prongHits[id])}  (${prongHits[id]}/${n})   unknown: ${prongUnknown[id]}${note}`);
}
console.log("\nverdict");
console.log(`  exact match        ${pct(verdictExact)}  (${verdictExact}/${n})`);
console.log(`  deferred to review ${pct(verdictSafe)}  (${verdictSafe}/${n})`);
console.log(`  wrong and decisive ${pct(misses.length)}  (${misses.length}/${n})  <- the ones that matter`);
if (misses.length > 0) {
  console.log("\ndecisive disagreements:");
  for (const m of misses) console.log(`  ${m}`);
}
console.log("\nfailure direction  (these are not summed; they cost different things)");
console.log(`  false_valid        ${pct(falseValid)}  (${falseValid}/${n})   said 有効, truth contestable — costs the tenant money`);
console.log(`  false_adverse      ${pct(falseAdverse)}  (${falseAdverse}/${n})   said 争う, truth holds — costs credibility and exposure`);
console.log(`  abstained          ${pct(abstained)}  (${abstained}/${n})   said 要確認 on a decidable clause — safe, not free`);
console.log(`  overconfident      ${pct(overconfident)}  (${overconfident}/${n})   decided where the corpus itself abstains`);

const penalty = falseValid * W_FALSE_VALID + falseAdverse * W_FALSE_ADVERSE + overconfident * W_FALSE_ADVERSE;
const safety = Math.max(0, 1 - penalty / n);
console.log(`\n  weighted safety    ${(safety * 100).toFixed(1)}%   (false_adverse weighted ${W_FALSE_ADVERSE}x, false_valid ${W_FALSE_VALID}x)`);
if (falseAdverseCases.length) {
  console.log("\nfalse_adverse — a wrong assertion would reach a 管理会社:");
  for (const c of falseAdverseCases) console.log(`  ${c}`);
}
if (falseValidCases.length) {
  console.log("\nfalse_valid — a tenant would pay a contestable charge:");
  for (const c of falseValidCases) console.log(`  ${c}`);
}
if (overconfidentCases.length) {
  console.log("\noverconfident — decided a clause the corpus will not:");
  for (const c of overconfidentCases) console.log(`  ${c}`);
}
if (!falseAdverseCases.length && !falseValidCases.length && !overconfidentCases.length) {
  console.log("\n  no failures in either direction; every disagreement is an abstention.");
}

console.log("\nThis is a scaffold. Read lib/modules/taikyo/rules.ts before trusting any number above.");
