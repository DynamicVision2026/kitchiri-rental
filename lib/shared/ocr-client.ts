/**
 * Browser-side client for /api/taikyo/ocr. Mirrors lib/shared/taikyo-client.ts's
 * own pattern: types imported with `import type` so none of the OCR engine, the
 * Anthropic SDK, or dual-pass.ts's logic is pulled into the client bundle — the
 * browser only ever sees shapes and calls the API route.
 */

import type { DisagreementStats, VerifiedLine } from "@/lib/ingest/dual-pass.ts";
import type { ImageRefusalReason } from "@/lib/ingest/refusal.ts";

export type { VerifiedLine, DisagreementStats, ImageRefusalReason };

export type OcrPageResult =
  | { page: number; ok: true; lines: VerifiedLine[] }
  | { page: number; ok: false; reason: ImageRefusalReason; messageJa: string; messageEn: string };

export interface OcrRunResponse {
  engineId: string;
  pages: OcrPageResult[];
  stats: DisagreementStats;
}

export class OcrError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OcrError";
  }
}

export async function runOcr(files: File[], signal?: AbortSignal): Promise<OcrRunResponse> {
  const form = new FormData();
  for (const f of files) form.append("file", f);
  const res = await fetch("/api/taikyo/ocr", { method: "POST", body: form, signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new OcrError(body?.message ?? `OCR request failed (${res.status})`, res.status);
  return body as OcrRunResponse;
}
