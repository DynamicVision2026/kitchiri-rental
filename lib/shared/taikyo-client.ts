/**
 * Browser-side client for the taikyo evaluation API.
 *
 * Types are imported with `import type` so none of the rule engine, the corpus or
 * zod is pulled into the client bundle — the browser only ever sees shapes.
 */

import type { ClauseEvaluation, EvaluateInput, Placement } from "@/lib/modules/taikyo/rules.ts";
import type { FactRequest } from "@/lib/modules/taikyo/questions.ts";
import type { Verdict } from "@/lib/modules/taikyo/taxonomy.ts";

export type { ClauseEvaluation, EvaluateInput, FactRequest, Placement, Verdict };

/** Reason text resolved server-side from lib/phrases, in both locales. */
export type LocalizedReasons = Record<"P1" | "P2" | "P3" | "P4", { ja: string; en: string }>;

/** What the API actually returns: the evaluation plus resolved reason text. */
export type EvaluationResponse = ClauseEvaluation & { reasonsText: LocalizedReasons };

export type AnswerValue = string | number | boolean;

/* ---------------------------------------------------------------- *
 * Batch contract scan
 * ---------------------------------------------------------------- */

export type { BatchReport, ClauseFinding, ClauseOverride, FinancialExposure, RiskLevel } from "@/lib/modules/taikyo/batch.ts";

import type { BatchReport, ClauseFinding, ClauseOverride } from "@/lib/modules/taikyo/batch.ts";

export type BatchFinding = ClauseFinding & { reasonsText: LocalizedReasons };
export type BatchReportResponse = Omit<BatchReport, "findings"> & { findings: BatchFinding[] };

/* ---------------------------------------------------------------- *
 * PDF ingestion
 * ---------------------------------------------------------------- */

export type { IngestResult, IngestError, IngestSuccess } from "@/lib/modules/taikyo/ingest.ts";
import type { IngestResult } from "@/lib/modules/taikyo/ingest.ts";

export async function extractPdfText(file: File, signal?: AbortSignal): Promise<IngestResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/taikyo/extract", { method: "POST", body: form, signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new EvaluateError(body?.message ?? body?.error ?? `Upload failed (${res.status})`, res.status, body?.issues);
  }
  return body.result as IngestResult;
}

/* ---------------------------------------------------------------- *
 * Negotiation letter
 * ---------------------------------------------------------------- */

export type { LetterClause, LetterResult, LetterRefusal } from "@/lib/modules/taikyo/letter.ts";
import type { LetterClause, LetterRefusal, LetterResult } from "@/lib/modules/taikyo/letter.ts";

export async function generateLetter(
  clauses: LetterClause[],
  opts: { propertyName?: string | null } = {},
  signal?: AbortSignal,
): Promise<LetterResult | LetterRefusal> {
  const res = await fetch("/api/taikyo/letter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clauses, propertyName: opts.propertyName ?? null }),
    signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new EvaluateError(body?.message ?? body?.error ?? `Request failed (${res.status})`, res.status, body?.issues);
  }
  return body.letter as LetterResult | LetterRefusal;
}

export async function evaluateContractText(
  contractText: string,
  overrides: Readonly<Record<number, ClauseOverride>> = {},
  signal?: AbortSignal,
): Promise<BatchReportResponse> {
  const res = await fetch("/api/taikyo/batch-evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contract_text: contractText, overrides }),
    signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new EvaluateError(body?.message ?? body?.error ?? `Request failed (${res.status})`, res.status, body?.issues);
  }
  return body.report as BatchReportResponse;
}

export class EvaluateError extends Error {
  constructor(message: string, readonly status: number, readonly issues?: { path: string; message: string }[]) {
    super(message);
    this.name = "EvaluateError";
  }
}

export async function evaluateClause(input: EvaluateInput, signal?: AbortSignal): Promise<EvaluationResponse> {
  const res = await fetch("/api/taikyo/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new EvaluateError(
      body?.message ?? body?.error ?? `Request failed (${res.status})`,
      res.status,
      body?.issues,
    );
  }
  return body.result as EvaluationResponse;
}

/**
 * Writes one answer into the next request at the dot path the FactRequest names.
 * Returns a new object; never mutates. Keeping this next to the client means the UI
 * does not have to know how `placement`, `declared` and `context` are shaped.
 */
export function applyAnswer(input: EvaluateInput, path: string, value: AnswerValue): EvaluateInput {
  if (path === "placement") return { ...input, placement: value as Placement };

  if (path.startsWith("declared.")) {
    const key = path.slice("declared.".length);
    return { ...input, declared: { ...(input.declared ?? {}), [key]: value } as EvaluateInput["declared"] };
  }

  if (path.startsWith("context.")) {
    const key = path.slice("context.".length);
    const base = input.context ?? {
      prefecture: null, layout: null, area_sqm: null, rent_monthly_jpy: null,
      deposit_jpy: null, charged_amount_jpy: null, tenancy_months: null,
    };
    return { ...input, context: { ...base, [key]: value } as EvaluateInput["context"] };
  }

  return input;
}

/** True when the answer is usable — guards against empty and non-finite numbers. */
export function isAnswered(kind: FactRequest["kind"], value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (kind === "number") return typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (kind === "boolean") return typeof value === "boolean";
  return typeof value === "string" && value.length > 0;
}
