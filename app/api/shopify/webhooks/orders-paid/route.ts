/**
 * POST /api/shopify/webhooks/orders-paid — grants access to a paid report.
 *
 * Register this URL in the Shopify admin (Settings → Notifications → Webhooks, or
 * via the Admin API) for the `orders/paid` topic, with the signing secret in
 * SHOPIFY_WEBHOOK_SECRET.
 *
 * Verification order matters: HMAC is checked against the RAW body before anything
 * else runs (a bad signature is rejected before the JSON is even parsed), and the
 * idempotency check happens inside AuditStore.markPaid — a double delivery of the
 * same order is detected there and this handler still returns 200, which is what
 * Shopify's retry policy expects (retrying a webhook that already succeeded should
 * never look like a failure to Shopify, or it will keep retrying).
 *
 * "The unguessable ID IS the credential": this route's only job is finding which
 * audit_id a paid order belongs to (via note_attributes — see
 * lib/server/shopify.ts) and flipping it to paid. There is no user record to create.
 */

import { NextResponse } from "next/server";
import { getAuditStore } from "@/lib/server/audit-store.ts";
import { sendReportEmail } from "@/lib/server/mail.ts";
import {
  amountJpyFromOrder,
  extractAuditId,
  verifyShopifyWebhook,
  type ShopifyOrderPaidPayload,
} from "@/lib/server/shopify.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook orders/paid] SHOPIFY_WEBHOOK_SECRET is not configured — refusing all deliveries.");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!(await verifyShopifyWebhook(rawBody, hmac, secret))) {
    console.error("[webhook orders/paid] HMAC verification failed — rejecting.");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: ShopifyOrderPaidPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const auditId = extractAuditId(payload);
  if (!auditId) {
    // No audit_id attribute on this order — either a purchase made outside our
    // funnel (someone bought the product directly in the Shopify storefront) or the
    // cart-attribute mechanism did not carry through as expected (see the
    // file-level caveat in lib/server/shopify.ts). Acknowledge with 200 so Shopify
    // does not retry forever, but log loudly: this needs a human to look at the
    // actual order, not a silent drop.
    console.error(`[webhook orders/paid] order ${payload.id} has no audit_id note_attribute — cannot grant access. Needs manual follow-up.`);
    return NextResponse.json({ ok: true, note: "no_audit_id" }, { status: 200 });
  }

  const store = getAuditStore();
  const result = await store.markPaid({
    auditId,
    shopifyOrderId: String(payload.id),
    shopifyOrderNumber: payload.name ?? (payload.order_number != null ? String(payload.order_number) : null),
    customerEmail: payload.email ?? payload.contact_email ?? null,
    amountJpy: amountJpyFromOrder(payload),
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      console.error(`[webhook orders/paid] order ${payload.id} named audit_id ${auditId}, which does not exist.`);
      return NextResponse.json({ ok: true, note: "audit_not_found" }, { status: 200 });
    }
    console.error(`[webhook orders/paid] order ${payload.id} tried to claim audit ${auditId}, already paid by a different order.`);
    return NextResponse.json({ ok: true, note: "conflict" }, { status: 200 });
  }

  if (result.alreadyApplied) {
    // Genuine double-delivery of a webhook we already processed. Do not send a
    // second email.
    return NextResponse.json({ ok: true, note: "already_applied" }, { status: 200 });
  }

  const email = result.record.customerEmail;
  if (email) {
    const sent = await sendReportEmail({ to: email, auditId: result.record.id, amountJpy: result.record.amountJpy });
    if (!sent.sent) console.warn(`[webhook orders/paid] payment recorded for audit ${auditId} but email was not sent (${sent.reason}).`);
  } else {
    console.warn(`[webhook orders/paid] order ${payload.id} has no email address — cannot send the report link.`);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
