/**
 * Held-out classifier check.  npm run eval:holdout
 *
 * The golden set was used to TUNE the classifier, so its score is a training number
 * and says nothing about generalisation. These 27 clauses were supplied separately,
 * never merged into the corpus, and never consulted while tuning. Treat this as the
 * honest estimate, and do not tune against it — the moment you do, it stops being
 * held out and this script stops being worth running.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TOKUYAKU_CODES } from "../../lib/modules/taikyo/taxonomy.ts";
import { classifyClause } from "../../lib/modules/taikyo/rules.ts";

const schema = z.object({
  note: z.string(),
  cases: z.array(z.object({ expected_code: z.enum(TOKUYAKU_CODES), clause_text: z.string().min(1) })),
});
const data = schema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("./classifier-holdout.json", import.meta.url)), "utf8")),
);

let top1 = 0, top3 = 0;
const misses: string[] = [];
for (const c of data.cases) {
  const cand = classifyClause(c.clause_text);
  const got = cand[0]?.code ?? null;
  if (got === c.expected_code) top1 += 1;
  if (cand.slice(0, 3).some((x) => x.code === c.expected_code)) top3 += 1;
  else if (got !== c.expected_code) misses.push(`  want ${c.expected_code.padEnd(14)} got ${(got ?? "NONE").padEnd(14)} ${c.clause_text.slice(0, 40)}`);
  if (got !== c.expected_code && cand.slice(0, 3).some((x) => x.code === c.expected_code))
    misses.push(`  want ${c.expected_code.padEnd(14)} got ${(got ?? "NONE").padEnd(14)} (in top-3)  ${c.clause_text.slice(0, 34)}`);
}
const n = data.cases.length;
console.log(`held-out classifier check — ${n} clauses never used for tuning\n`);
console.log(`  top-1  ${((top1 / n) * 100).toFixed(0)}%  (${top1}/${n})`);
console.log(`  top-3  ${((top3 / n) * 100).toFixed(0)}%  (${top3}/${n})`);
if (misses.length) { console.log("\nmisses:"); for (const m of misses) console.log(m); }
