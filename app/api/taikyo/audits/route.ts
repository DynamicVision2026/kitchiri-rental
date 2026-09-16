/**
 * POST /api/taikyo/audits — persist a computed report so it can survive to checkout
 * and back.
 *
 * Takes contract text and a report the client already has (from
 * POST /api/taikyo/batch-evaluate — this route does not re-run the engine, it only
 * stores what was already computed). Returns the new audit's id, which becomes the
 * `audit_id` cart attribute at checkout and the bearer credential in the report URL.
 *
 * No accounts: anyone can call this, the way anyone can use the free analyzer. The
 * only thing that matters afterward is who holds the returned id.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuditStore } from "@/lib/server/audit-store.ts";
import type { BatchReportResponse } from "@/lib/shared/taikyo-client.ts";

export const runtime = "nodejs";

const MAX_CHARS = 200_000;

// Deliberately permissive on `report` (z.unknown, cast after): it is the exact JSON
// the client received from our own batch-evaluate response a moment earlier, and
// round-tripping it through a full re-validation schema here would just duplicate
// batch.ts's types. What IS checked is contract_text, since that is user input.
const createAuditSchema = z.object({
  contract_text: z.string().min(1).max(MAX_CHARS),
  report: z.unknown(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = createAuditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  const store = getAuditStore();
  const record = await store.create({
    contractText: parsed.data.contract_text,
    report: parsed.data.report as BatchReportResponse,
  });

  return NextResponse.json({ auditId: record.id }, { status: 201 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed", message: "Use POST." }, { status: 405 });
}
