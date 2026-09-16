/**
 * Behavioural check for AuditStore. Runs against FileAuditStore by default (the test
 * double — see lib/server/audit-store.file.ts); run with AUDIT_STORE=supabase and
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set against a real project (with
 * db/migrations applied) to check SupabaseAuditStore against the exact same
 * assertions. Neither this script nor anything else in this repo has been run
 * against a live Supabase project — see docs/tickets/README.md.
 *
 *   npm run eval:audit-store
 */

import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { getAuditStore, isAuditAccessible, resetAuditStoreForTests } from "../../lib/server/audit-store.ts";
// Type-only: erased entirely by Node's type-stripping, so this never actually
// resolves taikyo-client.ts (which uses "@/" aliases only Next's bundler
// understands) at runtime.
import type { BatchReportResponse } from "../../lib/shared/taikyo-client.ts";

const TEST_FILE = `/tmp/audit-store-check.${randomUUID()}.json`;
if (!process.env.AUDIT_STORE) {
  process.env.AUDIT_STORE_FILE_PATH = TEST_FILE;
}

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    console.error(`  FAIL ${name}`);
    failures += 1;
  }
}

const FAKE_REPORT = {
  totalSegments: 1,
  clausesEvaluated: 1,
  clausesSkipped: 0,
  verdictCounts: { enforceable: 0, reducible: 1, severable: 0, unenforceable: 0, needs_review: 0 },
  adverseCount: 1,
  riskLevel: "moderate",
  exposure: { statedJpy: 25000, rentMonths: 0, unquantifiedCount: 0, ambiguousCount: 0, unresolvedJpy: 0, unresolvedCount: 0, caveats: [] },
  findings: [],
  advisory: "test fixture",
} as unknown as BatchReportResponse;

async function main() {
  const store = getAuditStore();
  console.log(`backend: ${store.constructor.name}\n`);

  // create + get
  const created = await store.create({ contractText: "第9条（原状回復）……", report: FAKE_REPORT, amountJpy: 3980 });
  check("create() returns an id", typeof created.id === "string" && created.id.length > 0);
  check("create() defaults unpaid", created.paidAt === null);
  check("create() sets a 90-day expiry from creation", (() => {
    const days = (new Date(created.expiresAt).getTime() - new Date(created.createdAt).getTime()) / 86_400_000;
    return Math.round(days) === 90;
  })());
  const fetched = await store.get(created.id);
  check("get() round-trips the record", fetched?.contractText === created.contractText);
  check("unpaid audit is not accessible", fetched !== null && !isAuditAccessible(fetched));

  // markPaid — first delivery
  const orderId = "gid://shopify/Order/1001";
  const paid1 = await store.markPaid({
    auditId: created.id,
    shopifyOrderId: orderId,
    shopifyOrderNumber: "#1001",
    customerEmail: "tenant@example.jp",
    amountJpy: 3980,
  });
  check("markPaid() succeeds", paid1.ok === true);
  if (paid1.ok) {
    check("first delivery is not a replay", paid1.alreadyApplied === false);
    check("markPaid() sets paidAt", paid1.record.paidAt !== null);
    check("markPaid() extends expiry to 90 days from payment", (() => {
      const days = (new Date(paid1.record.expiresAt).getTime() - new Date(paid1.record.paidAt!).getTime()) / 86_400_000;
      return Math.round(days) === 90;
    })());
    check("paid audit is accessible", isAuditAccessible(paid1.record));
  }

  // markPaid — SAME order delivered again (Shopify webhook double-delivery)
  const paid2 = await store.markPaid({
    auditId: created.id,
    shopifyOrderId: orderId,
    shopifyOrderNumber: "#1001",
    customerEmail: "tenant@example.jp",
    amountJpy: 3980,
  });
  check("double delivery of the same order succeeds", paid2.ok === true);
  if (paid2.ok) check("double delivery is reported as a replay, not applied twice", paid2.alreadyApplied === true);

  // markPaid — a DIFFERENT order for an already-paid audit is refused, not overwritten
  const conflict = await store.markPaid({
    auditId: created.id,
    shopifyOrderId: "gid://shopify/Order/9999",
    shopifyOrderNumber: "#9999",
    customerEmail: "someone-else@example.jp",
    amountJpy: 3980,
  });
  check("a different order id for an already-paid audit is refused", conflict.ok === false);
  const stillOriginal = await store.get(created.id);
  check("the refused conflict did not overwrite the original order", stillOriginal?.shopifyOrderId === orderId);

  // markPaid on an unknown id
  const unknown = await store.markPaid({
    auditId: randomUUID(),
    shopifyOrderId: "gid://shopify/Order/404",
    shopifyOrderNumber: "#404",
    customerEmail: null,
    amountJpy: 3980,
  });
  check("markPaid() on an unknown audit id is not_found", !unknown.ok && unknown.reason === "not_found");

  // markRevoked (refund)
  const revoked = await store.markRevoked(orderId, "customer_refunded_in_full");
  check("markRevoked() succeeds for a known order", revoked.ok === true);
  if (revoked.ok) {
    check("revoked audit has revokedAt set", revoked.record.revokedAt !== null);
    check("revoked audit is no longer accessible even though paid", !isAuditAccessible(revoked.record));
  }
  const revokedAgain = await store.markRevoked("gid://shopify/Order/no-such-order", "test");
  check("markRevoked() on an unknown order id fails cleanly", revokedAgain.ok === false);

  // purgeExpired
  const soonToExpire = await store.create({ contractText: "second fixture", report: FAKE_REPORT });
  const farFuture = new Date(Date.now() + 91 * 86_400_000);
  const purgedNone = await store.purgeExpired(new Date());
  check("purgeExpired() with nothing expired deletes 0", purgedNone === 0);
  const purgedAll = await store.purgeExpired(farFuture);
  check("purgeExpired() past every expiry deletes both fixtures", purgedAll === 2);
  const goneCheck = await store.get(soonToExpire.id);
  check("a purged audit is actually gone", goneCheck === null);

  console.log(failures === 0 ? "\nOK" : `\n${failures} FAILED`);
  resetAuditStoreForTests();
  try {
    unlinkSync(TEST_FILE);
  } catch {
    // fine if AUDIT_STORE pointed elsewhere (e.g. a real Supabase run)
  }
  process.exit(failures === 0 ? 0 : 1);
}

void main();
