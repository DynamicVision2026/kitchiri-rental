/**
 * OCR extraction interface — V16 Task 1.
 *
 * ONE MODULE, ONE CONTRACT, SWAPPABLE ENGINE. Nothing outside this file, and
 * ocr-claude.ts's implementation of it, knows which cloud model does the
 * transcription. lib/ingest/dual-pass.ts, the confirmation UI, and the accuracy
 * harness in eval/ocr/ all depend only on `OcrEngine` and `OcrResult`.
 *
 * THE BOUNDARY (see docs/tickets/v16-ocr-ingestion-pipeline.md and CLAUDE.md)
 * --------------------------------------------------------------------------
 * CLAUDE.md says "no model in the judgment path." This module is upstream of that
 * path, not inside it: an OcrEngine converts pixels to text and a field
 * classification (amount / date / name / label / other) — a description of what is
 * printed on the page, not a legal conclusion about it. It may not, and does not,
 * classify a Tokuyaku pattern, score a prong, or select a citation; that is still
 * lib/modules/taikyo/rules.ts, unchanged, deterministic, regex and a weighted
 * lexicon. What crosses the boundary from this module into the engine is plain
 * contract text — assembled from OCR lines only after every disputed or missing
 * `amount`/`date` field has been resolved by the person holding the paper (see
 * dual-pass.ts and app/(app)/taikyo/_screens/OcrConfirm.tsx) — indistinguishable,
 * from the engine's point of view, from text a user pasted by hand. The engine
 * never sees an engine id, a bounding box, or a confidence score.
 *
 * lib/modules/taikyo/ingest.ts (PDF text-layer extraction) is unaffected and still
 * carries no OCR at all — that module's job is reading a text layer a word
 * processor already wrote, not reading pixels, and stays exactly as skeptical of
 * scanned PDFs as it always was. This module exists for the case that PDF ingest
 * refuses: a photographed 清算書, not a text-layer PDF.
 */

export interface ImageInput {
  /** Raw image bytes (JPEG/PNG/HEIC-converted). */
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** 1-indexed page/photo number within the same document. */
  page: number;
}

/** The four kinds of field this pipeline cares about distinguishing; see Task 4's gates. */
export const FIELD_CLASSES = ["amount", "date", "name", "label", "other"] as const;
export type FieldClass = (typeof FIELD_CLASSES)[number];

export interface BoundingBox {
  /** Normalised 0-1, relative to the image's own width/height — resolution-independent. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrLine {
  text: string;
  /** Mandatory, not optional — without it the confirmation UI (Task 3) cannot crop
   *  the source region next to this line, which is the whole safety mechanism. */
  bbox: BoundingBox;
  page: number;
  field_class: FieldClass;
  /** The engine's own stated confidence, 0-1. Not used to auto-resolve a dispute —
   *  see dual-pass.ts, which never defaults to the higher-confidence pass. */
  confidence: number;
}

export interface OcrResult {
  lines: OcrLine[];
  raw_text: string;
}

export interface OcrEngine {
  /** Stamped onto the audit for reproducibility — see lib/server/audit-store.ts's
   *  AuditRecord once V16 persists an ingest, and eval/ocr/*'s ground-truth
   *  comparison, which is meaningless without knowing which engine produced a run. */
  id: string;
  transcribe(image: ImageInput, pass: "a" | "b"): Promise<OcrResult>;
}

export class OcrEngineError extends Error {
  // A plain field, not a TS constructor-parameter-property — this class must load
  // under Node's native type-stripping (eval/ocr/run.ts imports it directly, no
  // bundler in between), and parameter properties are TS-to-JS sugar that
  // strip-only mode does not support (SyntaxError: ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX
  // — caught by actually running eval:ocr-accuracy, not just tsc --noEmit, which
  // happily accepts the syntax it never actually needs to strip).
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "OcrEngineError";
  }
}
