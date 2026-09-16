/**
 * POST /api/taikyo/cleanup — delete every audit past its 90-day expires_at.
 *
 * Not called by any user-facing flow. It exists to be invoked by an external
 * scheduler (Vercel Cron, GitHub Actions on a schedule, an ordinary cron(1) job
 * hitting curl) against a deployed instance. The alternative in
 * db/migrations/0002_cleanup.sql (pg_cron calling delete_expired_audits()
 * directly) does the same deletion closer to the data and does not need this route
 * at all — set up whichever fits the hosting plan; this repo has not verified either
 * against a live scheduler; see db/README.md "Scheduling this".
 *
 * Protected by a shared secret rather than left open, since it deletes rows: set
 * CLEANUP_SECRET and pass it as `Authorization: Bearer <secret>`.
 */

import { NextResponse } from "next/server";
import { getAuditStore } from "@/lib/server/audit-store.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CLEANUP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "not_configured", message: "CLEANUP_SECRET is not set. Refusing to run an unprotected deletion route." },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const store = getAuditStore();
  const deleted = await store.purgeExpired();
  return NextResponse.json({ deleted }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed", message: "Use POST." }, { status: 405 });
}
