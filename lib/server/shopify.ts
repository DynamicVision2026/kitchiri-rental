/**
 * Shopify integration — checkout URL construction and webhook verification.
 *
 * NOT EXERCISED AGAINST A LIVE SHOPIFY STORE. There is no Admin API token in this
 * session, so nothing here was created via the Shopify API: no product, no webhook
 * subscription, no confirmed variant id. What IS verified (tests/fixtures/
 * webhook-check.ts, `npm run eval:webhook`) is the code that runs once a webhook
 * arrives: HMAC verification against a real HMAC-SHA256 computation, and the
 * idempotency behaviour in lib/server/audit-store.ts, using a hand-built payload
 * shaped like Shopify's documented orders/paid and refunds/create webhooks. Whether
 * that shape is exactly right — particularly `note_attributes` carrying the cart
 * attribute through to the order, which is Shopify's documented behaviour for
 * classic checkout but has not been confirmed against a real test order — is flagged
 * in extractAuditId() below and must be confirmed against a real Shopify sandbox
 * order before this handles a live payment. See docs/tickets/README.md.
 *
 * SERVER ONLY.
 */

/* ------------------------------------------------------------------ *
 * Checkout URL
 * ------------------------------------------------------------------ */

export interface CheckoutConfig {
  storeDomain: string; // e.g. "beyond-culture.myshopify.com" or a connected custom domain
  variantId: string; // the Shopify variant id for the ¥3,980 「退去費用チェック」 product
}

export class ShopifyNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Shopify checkout is not configured: missing ${missing.join(", ")}`);
    this.name = "ShopifyNotConfiguredError";
  }
}

export function readCheckoutConfig(): CheckoutConfig {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const variantId = process.env.SHOPIFY_VARIANT_ID;
  const missing = [
    !storeDomain && "SHOPIFY_STORE_DOMAIN",
    !variantId && "SHOPIFY_VARIANT_ID",
  ].filter((v): v is string => Boolean(v));
  if (missing.length > 0) throw new ShopifyNotConfiguredError(missing);
  return { storeDomain: storeDomain!, variantId: variantId! };
}

/**
 * Shopify's cart permalink syntax: /cart/{variant_id}:{quantity}, with
 * `attributes[Key]=Value` query params becoming cart-level note attributes that
 * Shopify's classic checkout forwards to the resulting Order's `note_attributes` —
 * this is what lets the orders/paid webhook find its way back to an audit_id with no
 * app, no Storefront API token, and no customer account. See the file-level comment:
 * this exact mechanism has not been confirmed against a real test order.
 */
export function buildCheckoutUrl(auditId: string, config: CheckoutConfig = readCheckoutConfig()): string {
  const url = new URL(`https://${config.storeDomain}/cart/${config.variantId}:1`);
  url.searchParams.set("attributes[audit_id]", auditId);
  return url.toString();
}

/* ------------------------------------------------------------------ *
 * Webhook HMAC verification
 * ------------------------------------------------------------------ */

/**
 * Verifies X-Shopify-Hmac-Sha256 against the RAW request body — must run before any
 * JSON.parse, since a re-serialized body will not reproduce the same bytes Shopify
 * signed (different key order or whitespace breaks the signature even though the
 * parsed data is identical).
 */
export async function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null, secret: string): Promise<boolean> {
  if (!hmacHeader) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = base64FromBytes(new Uint8Array(signature));
  return timingSafeEqualString(computed, hmacHeader);
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Constant-time comparison. Bails to a length check first (leaks length only, not content). */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Payload shapes (only the fields this product reads)
 * ------------------------------------------------------------------ */

export interface ShopifyNoteAttribute {
  name: string;
  value: string;
}

export interface ShopifyOrderPaidPayload {
  id: number | string;
  order_number?: number | string;
  name?: string; // e.g. "#1001"
  email?: string | null;
  contact_email?: string | null;
  note_attributes?: ShopifyNoteAttribute[];
  current_total_price?: string;
  total_price?: string;
  currency?: string;
}

export interface ShopifyRefundCreatePayload {
  id: number | string;
  order_id: number | string;
  note?: string | null;
}

/** Reads the audit_id cart attribute back off the order's note_attributes. */
export function extractAuditId(payload: ShopifyOrderPaidPayload): string | null {
  const attr = payload.note_attributes?.find((a) => a.name === "audit_id");
  return attr?.value ?? null;
}

export function amountJpyFromOrder(payload: ShopifyOrderPaidPayload): number {
  const raw = payload.current_total_price ?? payload.total_price;
  const n = raw ? Math.round(Number(raw)) : NaN;
  return Number.isFinite(n) ? n : 3980;
}
