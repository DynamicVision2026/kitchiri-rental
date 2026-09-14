/**
 * POST /api/taikyo/batch-evaluate — scan a whole lease.
 *
 * Body: { contract_text, placement?, concurrency? }
 * Returns a contract health report: counts by verdict, an upper-bound exposure figure
 * with its caveats, and a clause-by-clause drill-down with localized reason text.
 *
 * Reason codes are resolved here, as in the single-clause route, so the phrase bank
 * stays server-side and the client receives finished text in both locales.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { PRONG_IDS, type ProngId } from "@/lib/modules/taikyo/taxonomy.ts";
import { PLACEMENTS } from "@/lib/modules/taikyo/rules.ts";
import { evaluateContract } from "@/lib/modules/taikyo/batch.ts";
import { phrases, type Locale } from "@/lib/phrases/index.ts";

export const runtime = "nodejs";

/** Guards the worst case: a pasted book. 200k chars is far beyond any residential lease. */
const MAX_CHARS = 200_000;

const batchRequestSchema = z.object({
  contract_text: z.string().min(1).max(MAX_CHARS),
  placement: z.enum(PLACEMENTS).default("lease_body"),
  concurrency: z.number().int().min(1).max(32).default(8),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = batchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  const report = await evaluateContract(parsed.data.contract_text, {
    placement: parsed.data.placement,
    concurrency: parsed.data.concurrency,
  });

  const findings = report.findings.map((f) => ({
    ...f,
    reasonsText: Object.fromEntries(
      PRONG_IDS.map((id) => [id, phrases(f.evaluation.reasons[id])]),
    ) as Record<ProngId, Record<Locale, string>>,
  }));

  return NextResponse.json({ report: { ...report, findings } }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "method_not_allowed", message: "Use POST with a contract_text body." },
    { status: 405 },
  );
}
