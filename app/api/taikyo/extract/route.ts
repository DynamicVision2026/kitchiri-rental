/**
 * POST /api/taikyo/extract — pull the text layer out of an uploaded PDF lease.
 *
 * multipart/form-data with a `file` field. Returns the extracted text for the user to
 * review before analysis, or a structured refusal. Extraction failures come back 200
 * with { ok: false, failure, messageJa }: "this is a scan, please paste the text" is
 * an ordinary outcome the upload zone must render, not a server error.
 */

import { NextResponse } from "next/server";
import { MAX_PDF_BYTES, extractContractText } from "@/lib/modules/taikyo/ingest.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_form", message: "Send multipart/form-data with a `file` field." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file", message: "No `file` field in the upload." }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    // Checked before buffering so an oversized upload is not read into memory first.
    return NextResponse.json(
      { result: { ok: false, failure: "too_large", messageJa: "ファイルサイズが大きすぎます。", messageEn: "File too large." } },
      { status: 200 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return NextResponse.json({ result: await extractContractText(bytes) }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed", message: "Use POST with a PDF file." }, { status: 405 });
}
