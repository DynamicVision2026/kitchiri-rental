/**
 * The `audits` table, abstracted behind one interface so the webhook, the report
 * route and the cleanup route never talk to Supabase directly.
 *
 * SERVER ONLY. Never import this from a client component — it holds the service-role
 * key indirectly (through the Supabase implementation) and the full contract text of
 * every audit.
 *
 * Two implementations exist:
 *   - `SupabaseAuditStore` (audit-store.supabase.ts) — the real thing, against
 *     db/migrations/0001_audits.sql. Requires SUPABASE_URL and
 *     SUPABASE_SERVICE_ROLE_KEY.
 *   - `FileAuditStore` (audit-store.file.ts) — a TEST DOUBLE, not a production
 *     backend. It exists so the webhook's idempotency and expiry logic can be
 *     exercised end-to-end in an environment with no live Supabase project attached
 *     (this one). It is only ever selected by explicit opt-in (`AUDIT_STORE=file`)
 *     or automatically outside production when Supabase is not configured — see
 *     `getAuditStore()` below. It must never activate in production silently.
 */

import type { BatchReportResponse } from "@/lib/shared/taikyo-client.ts";
import { FileAuditStore } from "./audit-store.file.ts";
import { SupabaseAuditStore } from "./audit-store.supabase.ts";

export interface AuditRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  module: "taikyo";
  contractText: string;
  report: BatchReportResponse;
  amountJpy: number;
  paidAt: string | null;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;
  customerEmail: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  expiresAt: string;
}

export interface CreateAuditInput {
  contractText: string;
  report: BatchReportResponse;
  amountJpy?: number;
}

export type MarkPaidResult =
  | { ok: true; alreadyApplied: false; record: AuditRecord }
  | { ok: true; alreadyApplied: true; record: AuditRecord }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "order_claimed_by_different_audit" };

export interface MarkPaidInput {
  auditId: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string | null;
  customerEmail: string | null;
  amountJpy: number;
}

export type MarkRevokedResult =
  | { ok: true; record: AuditRecord }
  | { ok: false; reason: "order_not_found" };

/** True once a report may be shown: paid, not revoked, not past expiry. */
export function isAuditAccessible(record: AuditRecord, now: Date = new Date()): boolean {
  if (!record.paidAt) return false;
  if (record.revokedAt) return false;
  if (new Date(record.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

export interface AuditStore {
  create(input: CreateAuditInput): Promise<AuditRecord>;
  get(id: string): Promise<AuditRecord | null>;
  /**
   * Idempotent: a second delivery of the same Shopify order id is detected and
   * reported as `alreadyApplied: true` rather than double-applying or erroring.
   * `order_claimed_by_different_audit` covers the pathological case where the same
   * Shopify order id arrives for two different audit_id cart attributes — it should
   * never happen from a single checkout, and is refused rather than silently
   * overwriting whichever audit got there first.
   */
  markPaid(input: MarkPaidInput): Promise<MarkPaidResult>;
  markRevoked(shopifyOrderId: string, reason: string): Promise<MarkRevokedResult>;
  /** Deletes every row past `expiresAt`. Returns the count deleted. */
  purgeExpired(now?: Date): Promise<number>;
}

let cached: AuditStore | null = null;

/**
 * Picks the backend. Supabase whenever it is configured (the only production path);
 * the file-backed test double only by explicit `AUDIT_STORE=file`, or automatically
 * outside production when Supabase is not configured — which is exactly this
 * session's situation, and is why webhook idempotency can be verified here without a
 * live Supabase project. In production with nothing configured, this throws rather
 * than silently running on a file that will not survive the next deploy.
 */
export function getAuditStore(): AuditStore {
  if (cached) return cached;

  const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const forced = process.env.AUDIT_STORE;

  if (forced === "file") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUDIT_STORE=file is refused in production. This backend is a test double: " +
          "its data does not survive a redeploy. Configure SUPABASE_URL and " +
          "SUPABASE_SERVICE_ROLE_KEY instead.",
      );
    }
    cached = new FileAuditStore();
    return cached;
  }

  if (hasSupabase) {
    cached = new SupabaseAuditStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    return cached;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No audit store configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
        "Refusing to fall back to the file-backed test double in production.",
    );
  }

  // Development/test with nothing configured: the file-backed double, so `npm run
  // dev` and the local webhook simulation work without a live Supabase project.
  cached = new FileAuditStore();
  return cached;
}

/** Test-only: forces a fresh store on the next getAuditStore() call. */
export function resetAuditStoreForTests(): void {
  cached = null;
}
