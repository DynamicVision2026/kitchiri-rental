/**
 * POST /api/taikyo/letter — draft a negotiation letter for one or more clauses.
 *
 * Returns 200 with the draft, or 200 with { ok: false, reason } when no clause in the
 * request justifies writing. A refusal is an ordinary answer here, not an error: the
 * UI must be able to say "there is nothing to dispute in this clause" rather than
 * showing a failure.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { TOKUYAKU_CODES, VERDICTS } from "@/lib/modules/taikyo/taxonomy.ts";
import { buildNegotiationLetter } from "@/lib/modules/taikyo/letter.ts";
import { LOCALES } from "@/lib/phrases/index.ts";

export const runtime = "nodejs";

const letterRequestSchema = z.object({
  clauses: z.array(z.object({
    label: z.string().min(1).max(120),
    clauseText: z.string().min(1).max(4000),
    verdict: z.enum(VERDICTS),
    code: z.enum(TOKUYAKU_CODES).nullable().default(null),
    amountJpy: z.number().int().nonnegative().nullable().default(null),
  })).min(1).max(30),
  locale: z.enum(LOCALES).default("ja"),
  landlordName: z.string().max(120).nullable().default(null),
  tenantName: z.string().max(120).nullable().default(null),
  tenantAddress: z.string().max(240).nullable().default(null),
  propertyName: z.string().max(240).nullable().default(null),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = letterRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  return NextResponse.json({ letter: buildNegotiationLetter(parsed.data) }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed", message: "Use POST with a clauses array." }, { status: 405 });
}
