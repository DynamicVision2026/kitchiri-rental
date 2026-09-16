/**
 * DEV-ONLY. Not part of any npm script wired for CI — invoked by hand while manually
 * verifying the PDF export end-to-end (V15 Task 4), since there is no live Shopify
 * checkout to produce a real paid audit in this session.
 *
 * Runs the real engine (evaluateContract) against the repo's own sample lease
 * fixture, persists it via AuditStore, and marks it paid — exactly what
 * app/api/shopify/webhooks/orders-paid/route.ts would do on a real purchase, minus
 * the webhook and the Shopify order.
 */
import { readFileSync } from "node:fs";
import { evaluateContract } from "../lib/modules/taikyo/batch.ts";
import { getAuditStore } from "../lib/server/audit-store.ts";
import { PRONG_IDS, type ProngId } from "../lib/modules/taikyo/taxonomy.ts";
import { phrases, type Locale } from "../lib/phrases/index.ts";

async function main() {
  const contractText = readFileSync(new URL("../tests/fixtures/sample-lease.txt", import.meta.url), "utf8");
  const report = await evaluateContract(contractText);
  const findings = report.findings.map((f) => ({
    ...f,
    reasonsText: Object.fromEntries(PRONG_IDS.map((id) => [id, phrases(f.evaluation.reasons[id])])) as Record<ProngId, Record<Locale, string>>,
  }));

  const store = getAuditStore();
  const created = await store.create({ contractText, report: { ...report, findings } as never });
  const paid = await store.markPaid({
    auditId: created.id,
    shopifyOrderId: "gid://shopify/Order/dev-seed",
    shopifyOrderNumber: "#DEV1",
    customerEmail: "dev-test@example.jp",
    amountJpy: 3980,
  });

  if (!paid.ok) throw new Error(`markPaid failed: ${JSON.stringify(paid)}`);
  console.log(`paid audit id: ${paid.record.id}`);
  console.log(`findings: ${report.findings.length}, adverse: ${report.adverseCount}, risk: ${report.riskLevel}`);
}

void main();
