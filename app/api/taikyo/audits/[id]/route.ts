/**
 * GET /api/taikyo/audits/:id — read a persisted audit.
 *
 * The id is the bearer credential — see db/migrations/0001_audits.sql. Anyone
 * holding it can read the paid report; that is the entire access-control model for
 * this no-accounts product, matching the S5/S6/print routes that all key off the
 * same id.
 *
 * Three outcomes beyond 200: 402 (not paid yet — the free S3 result already covers
 * this state, so the UI should not normally hit this route before paying, but the
 * print/PDF routes do hit it directly and need a clean signal), 403 (revoked — a
 * refund), 410 (past its 90-day expires_at; the row itself may already be gone via
 * the cleanup sweep, or merely past the point this route will still serve it).
 */

import { NextResponse } from "next/server";
import { getAuditStore, isAuditAccessible } from "@/lib/server/audit-store.ts";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const store = getAuditStore();
  const record = await store.get(id);

  if (!record) {
    return NextResponse.json({ error: "not_found", message: "No audit with this id." }, { status: 404 });
  }
  if (record.revokedAt) {
    return NextResponse.json({ error: "revoked", message: "This purchase was refunded; the report is no longer available." }, { status: 403 });
  }
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "expired", message: "This report has passed its 90-day retention period and was deleted." }, { status: 410 });
  }
  if (!record.paidAt) {
    return NextResponse.json({ error: "payment_required", message: "This audit has not been paid for yet." }, { status: 402 });
  }

  return NextResponse.json(
    {
      id: record.id,
      report: record.report,
      contractText: record.contractText,
      paidAt: record.paidAt,
      expiresAt: record.expiresAt,
      accessible: isAuditAccessible(record),
    },
    { status: 200 },
  );
}
