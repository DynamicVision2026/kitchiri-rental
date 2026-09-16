/**
 * The real AuditStore, against db/migrations/0001_audits.sql.
 *
 * Uses the service-role key deliberately — there are no Supabase Auth users in a
 * no-accounts product, so RLS (enabled, with no policies) is bypassed by design
 * rather than satisfied by a policy. This client must never be constructed with
 * anything but the service-role key, and must never be imported into client code.
 *
 * NOT EXERCISED AGAINST A LIVE PROJECT. No Supabase project was attached to the
 * session that wrote this file — see docs/tickets/README.md. The query shapes are
 * written directly against 0001_audits.sql's columns, but the only end-to-end
 * verification this code has had is via FileAuditStore, which implements the exact
 * same interface against the exact same test suite (audit-store.check.ts). Before
 * this class is relied on in production: point SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY at a real project with the migration applied, and run
 * `npm run eval:audit-store` (see package.json) to confirm it passes the same
 * behavioural check the file store already does.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditRecord,
  AuditStore,
  CreateAuditInput,
  MarkPaidInput,
  MarkPaidResult,
  MarkRevokedResult,
} from "./audit-store.ts";

interface AuditRow {
  id: string;
  created_at: string;
  updated_at: string;
  module: "taikyo";
  contract_text: string;
  report: unknown;
  amount_jpy: number;
  paid_at: string | null;
  shopify_order_id: string | null;
  shopify_order_number: string | null;
  customer_email: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  expires_at: string;
}

function fromRow(row: AuditRow): AuditRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    module: row.module,
    contractText: row.contract_text,
    report: row.report as AuditRecord["report"],
    amountJpy: row.amount_jpy,
    paidAt: row.paid_at,
    shopifyOrderId: row.shopify_order_id,
    shopifyOrderNumber: row.shopify_order_number,
    customerEmail: row.customer_email,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    expiresAt: row.expires_at,
  };
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export class SupabaseAuditStore implements AuditStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async create(input: CreateAuditInput): Promise<AuditRecord> {
    const { data, error } = await this.client
      .from("audits")
      .insert({
        contract_text: input.contractText,
        report: input.report,
        amount_jpy: input.amountJpy ?? 3980,
      })
      .select()
      .single();
    if (error) throw new Error(`audits insert failed: ${error.message}`);
    return fromRow(data as AuditRow);
  }

  async get(id: string): Promise<AuditRecord | null> {
    const { data, error } = await this.client.from("audits").select().eq("id", id).maybeSingle();
    if (error) throw new Error(`audits select failed: ${error.message}`);
    return data ? fromRow(data as AuditRow) : null;
  }

  async markPaid(input: MarkPaidInput): Promise<MarkPaidResult> {
    const existing = await this.get(input.auditId);
    if (!existing) return { ok: false, reason: "not_found" };

    if (existing.paidAt) {
      if (existing.shopifyOrderId === input.shopifyOrderId) {
        return { ok: true, alreadyApplied: true, record: existing };
      }
      return { ok: false, reason: "order_claimed_by_different_audit" };
    }

    const paidAt = new Date();
    const expiresAt = new Date(paidAt.getTime() + NINETY_DAYS_MS);
    const { data, error } = await this.client
      .from("audits")
      .update({
        paid_at: paidAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        shopify_order_id: input.shopifyOrderId,
        shopify_order_number: input.shopifyOrderNumber,
        customer_email: input.customerEmail,
        amount_jpy: input.amountJpy,
      })
      // The unique constraint on shopify_order_id is the real backstop against two
      // audits racing to claim the same order; this WHERE clause additionally
      // ensures we only ever transition an audit that is still unpaid, closing the
      // race between two concurrent deliveries of the SAME order for the SAME audit.
      .eq("id", input.auditId)
      .is("paid_at", null)
      .select()
      .maybeSingle();

    if (error) {
      // A unique-violation here means another audit already claimed this order id
      // between our SELECT and this UPDATE — treat as the "claimed by a different
      // audit" outcome rather than surfacing a raw Postgres error.
      if (error.code === "23505") return { ok: false, reason: "order_claimed_by_different_audit" };
      throw new Error(`audits markPaid failed: ${error.message}`);
    }
    if (!data) {
      // Lost the race to a concurrent delivery that paid it first; re-read and treat
      // as idempotent if it was this same order, otherwise as a conflict.
      const now = await this.get(input.auditId);
      if (now?.shopifyOrderId === input.shopifyOrderId) return { ok: true, alreadyApplied: true, record: now };
      return { ok: false, reason: "order_claimed_by_different_audit" };
    }
    return { ok: true, alreadyApplied: false, record: fromRow(data as AuditRow) };
  }

  async markRevoked(shopifyOrderId: string, reason: string): Promise<MarkRevokedResult> {
    const { data, error } = await this.client
      .from("audits")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
      .eq("shopify_order_id", shopifyOrderId)
      .select()
      .maybeSingle();
    if (error) throw new Error(`audits markRevoked failed: ${error.message}`);
    if (!data) return { ok: false, reason: "order_not_found" };
    return { ok: true, record: fromRow(data as AuditRow) };
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    const { data, error } = await this.client
      .from("audits")
      .delete()
      .lt("expires_at", now.toISOString())
      .select("id");
    if (error) throw new Error(`audits purgeExpired failed: ${error.message}`);
    return data?.length ?? 0;
  }
}
