/**
 * Local simulation of the Shopify webhook flow — NOT a real Shopify sandbox
 * purchase. There is no live Shopify store in this session (see
 * lib/server/shopify.ts and docs/tickets/README.md), so this instead:
 *
 *   1. Creates a real audit via AuditStore (the file-backed test double).
 *   2. Builds a Shopify orders/paid payload shaped like Shopify's documented webhook
 *      body, carrying `audit_id` in note_attributes exactly as a checkout built by
 *      buildCheckoutUrl() is expected to produce it.
 *   3. Computes a REAL HMAC-SHA256 signature over the exact request body, using a
 *      throwaway test secret, via the exact verifyShopifyWebhook() function the
 *      route handler calls — not a mocked check.
 *   4. Runs the SAME sequence app/api/shopify/webhooks/orders-paid/route.ts runs —
 *      verify signature, parse body, extractAuditId, store.markPaid, send email —
 *      calling each of those functions directly, in the route's own order. This
 *      script cannot import the route module itself: like every other
 *      tests/fixtures/*-check.ts in this repo, it runs under plain
 *      `node --disable-warning=... file.ts` with no bundler, and only Next's own
 *      dev/build toolchain resolves the "@/" path aliases app/api/**\/route.ts files
 *      use. Composing the same lib calls here is the same tradeoff every other eval
 *      script in this repo already makes.
 *   5. Delivers the identical payload a second time and confirms it does not send a
 *      second email or apply the payment twice (idempotency).
 *   6. Delivers it with a WRONG signature and confirms it is rejected before
 *      anything else runs.
 *   7. Fires a refunds/create sequence and confirms the report becomes inaccessible.
 *
 * This proves the code that runs once a real webhook arrives. It does NOT prove that
 * a real Shopify order actually carries `audit_id` through to `note_attributes` the
 * way this assumes — that needs a real test order against a real store, which this
 * session cannot create.
 *
 *   npm run eval:webhook
 */

import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { getAuditStore, isAuditAccessible, resetAuditStoreForTests } from "../../lib/server/audit-store.ts";
import { amountJpyFromOrder, extractAuditId, verifyShopifyWebhook, type ShopifyOrderPaidPayload } from "../../lib/server/shopify.ts";
import { sendReportEmail } from "../../lib/server/mail.ts";
import type { BatchReportResponse } from "../../lib/shared/taikyo-client.ts";

const TEST_FILE = `/tmp/webhook-check.${randomUUID()}.json`;
process.env.AUDIT_STORE_FILE_PATH = TEST_FILE;
const WEBHOOK_SECRET = "test_webhook_secret_do_not_use_in_prod";
// RESEND_API_KEY intentionally left unset: exercises the "not configured, log and
// continue" path in lib/server/mail.ts rather than attempting a real send.

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    console.error(`  FAIL ${name}`);
    failures += 1;
  }
}

async function hmacSha256Base64(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  let binary = "";
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Mirrors app/api/shopify/webhooks/orders-paid/route.ts POST(), step for step. */
async function handleOrdersPaid(rawBody: string, hmacHeader: string | null): Promise<{ status: number; note?: string }> {
  if (!(await verifyShopifyWebhook(rawBody, hmacHeader, WEBHOOK_SECRET))) return { status: 401 };
  const payload: ShopifyOrderPaidPayload = JSON.parse(rawBody);
  const auditId = extractAuditId(payload);
  if (!auditId) return { status: 200, note: "no_audit_id" };

  const store = getAuditStore();
  const result = await store.markPaid({
    auditId,
    shopifyOrderId: String(payload.id),
    shopifyOrderNumber: payload.name ?? null,
    customerEmail: payload.email ?? null,
    amountJpy: amountJpyFromOrder(payload),
  });
  if (!result.ok) return { status: 200, note: result.reason === "not_found" ? "audit_not_found" : "conflict" };
  if (result.alreadyApplied) return { status: 200, note: "already_applied" };

  if (result.record.customerEmail) {
    await sendReportEmail({ to: result.record.customerEmail, auditId: result.record.id, amountJpy: result.record.amountJpy });
  }
  return { status: 200 };
}

/** Mirrors app/api/shopify/webhooks/refunds-create/route.ts POST(). */
async function handleRefundsCreate(rawBody: string, hmacHeader: string | null): Promise<{ status: number; note?: string }> {
  if (!(await verifyShopifyWebhook(rawBody, hmacHeader, WEBHOOK_SECRET))) return { status: 401 };
  const payload: { id: number; order_id: number } = JSON.parse(rawBody);
  const store = getAuditStore();
  const result = await store.markRevoked(String(payload.order_id), `Shopify refund ${payload.id}`);
  if (!result.ok) return { status: 200, note: "no_matching_audit" };
  return { status: 200 };
}

const FAKE_REPORT = {
  totalSegments: 1, clausesEvaluated: 1, clausesSkipped: 0,
  verdictCounts: { enforceable: 0, reducible: 1, severable: 0, unenforceable: 0, needs_review: 0 },
  adverseCount: 1, riskLevel: "moderate",
  exposure: { statedJpy: 25000, rentMonths: 0, unquantifiedCount: 0, ambiguousCount: 0, unresolvedJpy: 0, unresolvedCount: 0, caveats: [] },
  findings: [], advisory: "test fixture",
} as unknown as BatchReportResponse;

async function main() {
  const store = getAuditStore();
  const audit = await store.create({ contractText: "第9条（原状回復）……", report: FAKE_REPORT });
  console.log(`fixture audit: ${audit.id}\n`);

  const orderPayload = {
    id: 5001,
    order_number: 1001,
    name: "#1001",
    email: "tenant@example.jp",
    note_attributes: [{ name: "audit_id", value: audit.id }],
    current_total_price: "3980.00",
    currency: "JPY",
  };
  const rawBody = JSON.stringify(orderPayload);
  const goodSig = await hmacSha256Base64(rawBody, WEBHOOK_SECRET);
  const badSig = await hmacSha256Base64(rawBody, "wrong_secret");

  // 6. wrong signature is rejected
  const rejected = await handleOrdersPaid(rawBody, badSig);
  check("wrong HMAC signature is rejected (401)", rejected.status === 401);
  const stillUnpaid = await store.get(audit.id);
  check("a rejected webhook does not grant access", stillUnpaid !== null && !isAuditAccessible(stillUnpaid));

  // 4. first real delivery
  const first = await handleOrdersPaid(rawBody, goodSig);
  check("correctly-signed orders/paid is accepted (200)", first.status === 200);
  const afterFirst = await store.get(audit.id);
  check("audit is paid after the first delivery", afterFirst?.paidAt != null);
  check("audit is accessible after the first delivery", afterFirst !== null && isAuditAccessible(afterFirst));
  check("expiry is now ~90 days from payment, not from creation", afterFirst !== null && (() => {
    const days = (new Date(afterFirst.expiresAt).getTime() - new Date(afterFirst.paidAt!).getTime()) / 86_400_000;
    return Math.round(days) === 90;
  })());

  // 5. double delivery — same signed body, delivered again (Shopify's documented
  // at-least-once retry behaviour)
  const second = await handleOrdersPaid(rawBody, goodSig);
  check("double delivery of the same order still returns 200", second.status === 200);
  check("double delivery is recognised as already_applied, not reprocessed", second.note === "already_applied");

  // 7. refund revokes access
  const refundPayload = { id: 9001, order_id: 5001, note: "customer request" };
  const refundBody = JSON.stringify(refundPayload);
  const refundSig = await hmacSha256Base64(refundBody, WEBHOOK_SECRET);
  const refundRes = await handleRefundsCreate(refundBody, refundSig);
  check("correctly-signed refunds/create is accepted (200)", refundRes.status === 200);
  const afterRefund = await store.get(audit.id);
  check("audit is revoked after the refund webhook", afterRefund?.revokedAt != null);
  check("a paid-but-revoked audit is no longer accessible", afterRefund !== null && !isAuditAccessible(afterRefund));

  console.log(failures === 0 ? "\nOK" : `\n${failures} FAILED`);
  resetAuditStoreForTests();
  try { unlinkSync(TEST_FILE); } catch { /* fine */ }
  process.exit(failures === 0 ? 0 : 1);
}

void main();
