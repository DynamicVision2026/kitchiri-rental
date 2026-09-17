/**
 * Refusal floor for photographed documents — V16 Task 5.
 *
 * Mirrors lib/modules/taikyo/ingest.ts's own floor (MIN_CHARS_PER_PAGE): below a
 * measurable legibility threshold, refuse loudly and route to paste rather than
 * hand back a table built from noise. The floor here is computed from what the OCR
 * engine itself reported (how much it transcribed, and how confident it was) —
 * this module does not run its own pixel-level blur/darkness/crop detection, which
 * would need a real image-quality model this session has no way to build or
 * calibrate. The refusal message NAMES common causes (too dark, too blurry,
 * cropped) as guidance for what to try next, not as a diagnosis the system
 * actually determined — that distinction matters and is preserved in the copy
 * below. A future revision could add real per-cause detection; this one is honest
 * about measuring only what it can actually measure.
 */

import type { OcrResult } from "./ocr.ts";

/** Below this mean per-line confidence (as self-reported by the engine, averaged
 *  across both passes), the transcription is not trustworthy enough to build a
 *  confirmation screen around. */
export const MIN_MEAN_CONFIDENCE = 0.25;

export type ImageRefusalReason = "no_text" | "low_confidence" | "empty_result";

export interface ImageRefusal {
  ok: false;
  reason: ImageRefusalReason;
  messageJa: string;
  messageEn: string;
}

const MESSAGES: Record<ImageRefusalReason, { ja: string; en: string }> = {
  empty_result: {
    ja:
      "この画像からは文字を読み取れませんでした。以下をご確認のうえ、撮り直すか、本文を直接貼り付けてください。" +
      "・部屋を明るくしてから撮影する（暗すぎないか）\n" +
      "・ピントを合わせ、手ブレしないようにする（ぼやけていないか）\n" +
      "・書類の四辺が写真に収まっているか（欠けて写っていないか）",
    en:
      "No text could be read from this image. Please check: the room is well-lit (not too dark), " +
      "the photo is in focus (not blurry), and the whole document fits in frame (not cropped) — " +
      "then retake the photo, or paste the text directly instead.",
  },
  no_text: {
    ja:
      "この画像は一部しか読み取れませんでした。暗すぎる・ぼやけている・書類が切れて写っている、" +
      "のいずれかが考えられます。撮り直すか、本文を直接貼り付けてください。",
    en:
      "This image could only be partly read — possibly too dark, blurry, or with part of the " +
      "document cropped out of frame. Please retake the photo, or paste the text directly.",
  },
  low_confidence: {
    ja:
      "この画像は読み取れましたが、文字の確実性が低く、金額を誤って読み取るおそれがあります。" +
      "明るい場所で、ピントを合わせて撮り直していただくか、本文を直接貼り付けてください。",
    en:
      "This image was read, but with low confidence — there is a real risk of misreading a figure. " +
      "Please retake the photo in better light and focus, or paste the text directly.",
  },
};

function fail(reason: ImageRefusalReason): ImageRefusal {
  return { ok: false, reason, messageJa: MESSAGES[reason].ja, messageEn: MESSAGES[reason].en };
}

function meanConfidence(result: OcrResult): number {
  if (result.lines.length === 0) return 0;
  return result.lines.reduce((sum, l) => sum + l.confidence, 0) / result.lines.length;
}

/**
 * Checked once per image, after both OCR passes return, before dual-pass
 * verification runs — an image this bad is not worth reconciling two readings of.
 *
 * Deliberately NOT gated on raw_text length: a legitimately short document (a
 * single line item on a receipt, not a full contract page) can be entirely
 * legible at a handful of characters, so a character-count floor borrowed from the
 * full-contract-page PDF path (lib/modules/taikyo/ingest.ts's MIN_CHARS_PER_PAGE)
 * would refuse real, readable short photos — caught by
 * tests/fixtures/ocr-route-check.ts's disputed-figure fixture, which is short on
 * purpose. The two signals actually measured are both about the ENGINE'S OWN
 * behaviour, not document length: whether it found anything at all, and how
 * confident it was in what it found.
 */
export function checkLegibility(passA: OcrResult, passB: OcrResult): ImageRefusal | null {
  const aEmpty = passA.lines.length === 0;
  const bEmpty = passB.lines.length === 0;
  if (aEmpty && bEmpty) return fail("empty_result");
  // Exactly one pass found nothing at all — a sharp asymmetry between two
  // independent readings of the same image is itself a legibility red flag, even
  // though the other pass returned something.
  if (aEmpty || bEmpty) return fail("no_text");

  const combinedConfidence = (meanConfidence(passA) + meanConfidence(passB)) / 2;
  if (combinedConfidence < MIN_MEAN_CONFIDENCE) return fail("low_confidence");
  return null;
}
