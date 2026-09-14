/**
 * Batch report check.  npm run eval:batch
 * Asserts the whole-contract path end to end against the sample lease.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateContract, extractAmounts } from "../../lib/modules/taikyo/batch.ts";

const source = readFileSync(fileURLToPath(new URL("./sample-lease.txt", import.meta.url)), "utf8");
const report = await evaluateContract(source);
const failures: string[] = [];
const expect = (c: boolean, m: string) => { if (!c) failures.push(m); };

console.log(`contract health report\n`);
console.log(`  segments            ${report.totalSegments}`);
console.log(`  clauses evaluated   ${report.clausesEvaluated}`);
console.log(`  ordinary text       ${report.clausesSkipped}`);
console.log(`  risk level          ${report.riskLevel}`);
console.log(`  verdicts            ${Object.entries(report.verdictCounts).filter(([, n]) => n > 0).map(([v, n]) => `${v}=${n}`).join("  ")}`);
console.log(`  exposure            ¥${report.exposure.statedJpy.toLocaleString()} (upper bound) + ${report.exposure.rentMonths} months of rent`);
console.log(`  unresolved          ¥${report.exposure.unresolvedJpy.toLocaleString()} across ${report.exposure.unresolvedCount} clause(s)`);
console.log(`  unquantified        ${report.exposure.unquantifiedCount}   ambiguous ${report.exposure.ambiguousCount}\n`);
for (const f of report.findings) {
  console.log(`  ${f.label.padEnd(20)} ${String(f.evaluation.code).padEnd(14)} ${f.evaluation.verdict.padEnd(14)} ¥${f.amounts.headlineJpy ?? "-"}`);
}

expect(report.clausesEvaluated >= 8, `expected 8+ recognised clauses, got ${report.clausesEvaluated}`);
expect(report.clausesSkipped >= 4, `ordinary articles should be skipped, got ${report.clausesSkipped}`);
expect(report.riskLevel === "high", `this lease is stacked with bad clauses; got ${report.riskLevel}`);
expect(report.verdictCounts.unenforceable >= 3, "should find several unenforceable clauses");
expect(report.findings.every((f) => f.evaluation.code !== null), "skipped clauses must not appear as findings");
expect(report.exposure.statedJpy > 0, "stated exposure should be non-zero for this lease");
expect(report.exposure.caveats.length >= 2, "exposure must always carry its caveats");
expect(report.exposure.unresolvedJpy >= 120000, "the 120,000 cleaning charge must surface as unresolved, not vanish");
// 善管注意義務 and 転貸禁止 are ordinary terms, not Tokuyaku findings.
expect(!report.findings.some((f) => f.text.includes("善良な管理者")), "an ordinary duty-of-care article leaked into findings");

const amounts = extractAmounts("敷金として金270,000円を預託する。なお、賃料2か月分に相当する金額は敷引金として返還しない。");
expect(amounts.yen.length === 1 && amounts.yen[0] === 270000, `yen extraction wrong: ${JSON.stringify(amounts.yen)}`);
expect(amounts.rentMonths.length === 1 && amounts.rentMonths[0] === 2, `rent-months extraction wrong: ${JSON.stringify(amounts.rentMonths)}`);

if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nOK");
