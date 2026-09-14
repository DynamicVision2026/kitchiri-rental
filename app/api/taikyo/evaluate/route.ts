/**
 * POST /api/taikyo/evaluate — score one 特約 clause against the taikyo rule set.
 *
 * Request body (zod-validated, see evaluateRequestSchema):
 *   { clause_text, placement?, context?, code? }
 *
 * Responses are provisional by construction: the handler always returns the engine's
 * `advisory` and `reviewRequired` fields, and callers must surface them. An unknown
 * prong is reported as "unknown" and routes to needs_review — it is never rendered
 * as a finding against a landlord.
 */

import { NextResponse } from "next/server";
import { evaluateClause, evaluateRequestSchema } from "@/lib/modules/taikyo/rules.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = evaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ result: evaluateClause(parsed.data) }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "method_not_allowed", message: "Use POST with a clause_text body." },
    { status: 405 },
  );
}
