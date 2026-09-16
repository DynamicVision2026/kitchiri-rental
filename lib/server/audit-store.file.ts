/**
 * TEST DOUBLE. Not a production backend — see audit-store.ts for when this is used.
 *
 * Stores audits as one JSON file under the OS temp dir (or AUDIT_STORE_FILE_PATH).
 * Exists so the webhook's HMAC verification, idempotency, and 90-day expiry logic
 * can be exercised end-to-end without a live Supabase project — which is this
 * session's actual situation. Implements exactly the same AuditStore interface
 * SupabaseAuditStore does, and both are exercised by
 * tests/fixtures/audit-store-check.ts, so a behavioural difference between them is a
 * test failure, not a surprise found in production.
 *
 * Concurrency: a coarse in-process write lock (a promise chain) serializes writes
 * within one Node process. That is sufficient for local testing and for a single
 * Next.js dev server; it is NOT a substitute for the database-level uniqueness
 * SupabaseAuditStore gets from the `shopify_order_id` unique constraint, and this
 * class must never run in production for exactly that reason.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import type {
  AuditRecord,
  AuditStore,
  CreateAuditInput,
  MarkPaidInput,
  MarkPaidResult,
  MarkRevokedResult,
} from "./audit-store.ts";

const DEFAULT_PATH = `${tmpdir()}/kitchiri-rental-audits.test-double.json`;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function filePath(): string {
  return process.env.AUDIT_STORE_FILE_PATH ?? DEFAULT_PATH;
}

// turbopackIgnore: this path is a temp-dir or explicitly-configured test-fixture
// location, never a project file, and this class never runs in production (see
// audit-store.ts) — without the ignore comment, Next's static analysis traces the
// whole project into the server bundle on the strength of this one dynamic path.
function load(): AuditRecord[] {
  const path = filePath();
  if (!existsSync(/*turbopackIgnore: true*/ path)) return [];
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")) as AuditRecord[];
  } catch {
    return [];
  }
}

function save(records: AuditRecord[]): void {
  const path = filePath();
  mkdirSync(/*turbopackIgnore: true*/ dirname(path), { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ path, JSON.stringify(records, null, 2));
}

export class FileAuditStore implements AuditStore {
  private writeQueue: Promise<unknown> = Promise.resolve();

  private mutate<T>(fn: (records: AuditRecord[]) => { records: AuditRecord[]; result: T }): Promise<T> {
    const next = this.writeQueue.then(() => {
      const { records, result } = fn(load());
      save(records);
      return result;
    });
    // Never let one failed mutation jam the queue for later, independent calls.
    this.writeQueue = next.catch(() => undefined);
    return next as Promise<T>;
  }

  async create(input: CreateAuditInput): Promise<AuditRecord> {
    return this.mutate<AuditRecord>((records) => {
      const now = new Date();
      const record: AuditRecord = {
        id: randomUUID(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        module: "taikyo",
        contractText: input.contractText,
        report: input.report,
        amountJpy: input.amountJpy ?? 3980,
        paidAt: null,
        shopifyOrderId: null,
        shopifyOrderNumber: null,
        customerEmail: null,
        revokedAt: null,
        revokedReason: null,
        expiresAt: new Date(now.getTime() + NINETY_DAYS_MS).toISOString(),
      };
      return { records: [...records, record], result: record };
    });
  }

  async get(id: string): Promise<AuditRecord | null> {
    return load().find((r) => r.id === id) ?? null;
  }

  async markPaid(input: MarkPaidInput): Promise<MarkPaidResult> {
    return this.mutate<MarkPaidResult>((records) => {
      const idx = records.findIndex((r) => r.id === input.auditId);
      if (idx === -1) return { records, result: { ok: false, reason: "not_found" } };

      const existing = records[idx];
      if (existing.paidAt) {
        if (existing.shopifyOrderId === input.shopifyOrderId) {
          return { records, result: { ok: true, alreadyApplied: true, record: existing } };
        }
        return { records, result: { ok: false, reason: "order_claimed_by_different_audit" } };
      }

      // Mirrors the unique-constraint backstop in SupabaseAuditStore: refuse if any
      // OTHER audit already claimed this Shopify order id.
      const claimedElsewhere = records.some((r) => r.id !== input.auditId && r.shopifyOrderId === input.shopifyOrderId);
      if (claimedElsewhere) {
        return { records, result: { ok: false, reason: "order_claimed_by_different_audit" } };
      }

      const paidAt = new Date();
      const updated: AuditRecord = {
        ...existing,
        updatedAt: paidAt.toISOString(),
        paidAt: paidAt.toISOString(),
        expiresAt: new Date(paidAt.getTime() + NINETY_DAYS_MS).toISOString(),
        shopifyOrderId: input.shopifyOrderId,
        shopifyOrderNumber: input.shopifyOrderNumber,
        customerEmail: input.customerEmail,
        amountJpy: input.amountJpy,
      };
      const next = [...records];
      next[idx] = updated;
      return { records: next, result: { ok: true, alreadyApplied: false, record: updated } };
    });
  }

  async markRevoked(shopifyOrderId: string, reason: string): Promise<MarkRevokedResult> {
    return this.mutate<MarkRevokedResult>((records) => {
      const idx = records.findIndex((r) => r.shopifyOrderId === shopifyOrderId);
      if (idx === -1) return { records, result: { ok: false, reason: "order_not_found" } };
      const updated: AuditRecord = {
        ...records[idx],
        updatedAt: new Date().toISOString(),
        revokedAt: new Date().toISOString(),
        revokedReason: reason,
      };
      const next = [...records];
      next[idx] = updated;
      return { records: next, result: { ok: true, record: updated } };
    });
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    return this.mutate<number>((records) => {
      const keep = records.filter((r) => new Date(r.expiresAt).getTime() >= now.getTime());
      return { records: keep, result: records.length - keep.length };
    });
  }
}
