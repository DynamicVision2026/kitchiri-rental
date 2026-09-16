/**
 * GET /api/taikyo/checkout?audit_id=<id> — redirect to Shopify Checkout.
 *
 * A plain 302 redirect rather than a POST + JSON response, deliberately: this is
 * meant to be the literal `href` of the S4 "申し込む" button, so it works as an
 * ordinary link (no JS required, opens correctly in a new tab, survives a page
 * refresh mid-navigation) rather than needing a fetch-then-navigate dance.
 *
 * See lib/server/shopify.ts for what is and is not verified about the URL this
 * builds — no live Shopify store was available to confirm the checkout actually
 * carries `audit_id` through to the order.
 */

import { NextResponse } from "next/server";
import { getAuditStore } from "@/lib/server/audit-store.ts";
import { ShopifyNotConfiguredError, buildCheckoutUrl } from "@/lib/server/shopify.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const auditId = new URL(request.url).searchParams.get("audit_id");
  if (!auditId) {
    return NextResponse.json({ error: "missing_audit_id", message: "?audit_id=<id> is required." }, { status: 400 });
  }

  const store = getAuditStore();
  const record = await store.get(auditId);
  if (!record) {
    return NextResponse.json({ error: "not_found", message: "No audit with this id." }, { status: 404 });
  }
  if (record.paidAt) {
    // Already paid — do not send back through checkout. Go straight to the report.
    return NextResponse.redirect(new URL(`/taikyo/r/${auditId}`, request.url), { status: 302 });
  }

  try {
    const url = buildCheckoutUrl(auditId);
    return NextResponse.redirect(url, { status: 302 });
  } catch (e) {
    if (e instanceof ShopifyNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: e.message }, { status: 503 });
    }
    throw e;
  }
}
