/**
 * POST /api/taikyo/ocr — transcribe one or more photographed pages via dual-pass
 * OCR, verify the amount/date figures against each other, and return per-page
 * results for the region-linked confirmation screen (V16 Task 3) to render.
 *
 * multipart/form-data, one or more `file` fields (image/jpeg, image/png,
 * image/webp). Each image is processed independently: an unreadable page does not
 * block the others, so a user can retake just the one bad photo.
 *
 * NOTHING RETURNED HERE HAS BEEN CONFIRMED. `lines` on an ok page still contains
 * `disputed` and `missing` entries — the confirmation screen (and only the
 * confirmation screen, driven by a person holding the physical document) resolves
 * those before the assembled text ever reaches evaluateContractText(). This route
 * does not call the judgment engine at all.
 */

import { NextResponse } from "next/server";
import { getConfiguredOcrEngine } from "@/lib/ingest/engine-select.ts";
import { checkLegibility, type ImageRefusalReason } from "@/lib/ingest/refusal.ts";
import { disagreementStats, verifyDualPass, type VerifiedLine } from "@/lib/ingest/dual-pass.ts";
import type { ImageInput } from "@/lib/ingest/ocr.ts";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 6;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PageResult =
  | { page: number; ok: true; lines: VerifiedLine[] }
  | { page: number; ok: false; reason: ImageRefusalReason; messageJa: string; messageEn: string };

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form", message: "Send multipart/form-data with one or more `file` fields." }, { status: 400 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "missing_file", message: "No `file` fields in the upload." }, { status: 400 });
  }
  if (files.length > MAX_IMAGES) {
    return NextResponse.json({ error: "too_many_files", message: `At most ${MAX_IMAGES} images per submission.` }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "file_too_large", message: `"${f.name}" exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024}MB limit.` }, { status: 400 });
    }
    if (!ACCEPTED_TYPES.has(f.type)) {
      return NextResponse.json({ error: "unsupported_type", message: `"${f.name}" is ${f.type || "an unrecognised type"}; expected JPEG, PNG or WebP.` }, { status: 400 });
    }
  }

  let engine;
  try {
    engine = getConfiguredOcrEngine();
  } catch (e) {
    return NextResponse.json({ error: "not_configured", message: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }

  const pageResults: PageResult[] = [];
  const okLines: VerifiedLine[] = [];

  for (let i = 0; i < files.length; i++) {
    const page = i + 1;
    const file = files[i];
    const image: ImageInput = {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mediaType: file.type as ImageInput["mediaType"],
      page,
    };

    let passA, passB;
    try {
      [passA, passB] = await Promise.all([engine.transcribe(image, "a"), engine.transcribe(image, "b")]);
    } catch (e) {
      return NextResponse.json(
        { error: "ocr_failed", message: e instanceof Error ? e.message : String(e), page },
        { status: 502 },
      );
    }

    const refusal = checkLegibility(passA, passB);
    if (refusal) {
      pageResults.push({ page, ok: false, reason: refusal.reason, messageJa: refusal.messageJa, messageEn: refusal.messageEn });
      continue;
    }

    const lines = verifyDualPass(passA, passB);
    pageResults.push({ page, ok: true, lines });
    okLines.push(...lines);
  }

  return NextResponse.json(
    {
      engineId: engine.id,
      pages: pageResults,
      stats: disagreementStats(okLines),
    },
    { status: 200 },
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed", message: "Use POST with one or more image files." }, { status: 405 });
}
