/**
 * POST /api/shopify/webhooks/refunds-create — revokes access after a refund.
 *
 * Register for the `refunds/create` topic, same SHOPIFY_WEBHOOK_SECRET as
 * orders/paid. There is no partial-refund distinction here: any refund on the order
 * revokes the report. The unguessable URL may already have been emailed and opened —
 * revocation cannot un-send it, only stop it working going forward, which is the
 * best a no-accounts product can do (see AuditStore.markRevoked).
 */

import { NextResponse } from "next/server";
import { getAuditStore } from "@/lib/server/audit-store.ts";
import { verifyShopifyWebhook, type ShopifyRefundCreatePayload } from "@/lib/server/shopify.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook refunds/create] SHOPIFY_WEBHOOK_SECRET is not configured — refusing all deliveries.");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!(await verifyShopifyWebhook(rawBody, hmac, secret))) {
    console.error("[webhook refunds/create] HMAC verification failed — rejecting.");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: ShopifyRefundCreatePayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const store = getAuditStore();
  const result = await store.markRevoked(String(payload.order_id), `Shopify refund ${payload.id}`);

  if (!result.ok) {
    // No audit was ever paid against this order — plausible if the refund is for a
    // different product in the same Shopify store, or arrived before orders/paid
    // somehow did. Acknowledge either way; nothing to revoke is not a delivery
    // failure Shopify should retry.
    console.warn(`[webhook refunds/create] refund ${payload.id} for order ${payload.order_id} matched no paid audit.`);
    return NextResponse.json({ ok: true, note: "no_matching_audit" }, { status: 200 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
