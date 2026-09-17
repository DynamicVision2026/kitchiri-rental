/**
 * Dual-pass numeral verification — V16 Task 2.
 *
 * Pure and deterministic: given two independent OcrResult transcriptions of the same
 * image, decide per line whether the two passes agree, disagree, or one pass missed
 * it entirely. No model call happens here, which is exactly why this file is fully
 * unit-testable without a live OCR engine — see tests/fixtures/dual-pass-check.ts.
 *
 * SCOPE: character-by-character comparison applies to `amount` and `date` fields
 * only, per the ticket ("Prose disagreement is noise; figure disagreement is the
 * failure that matters"). `name`, `label` and `other` fields are not compared here
 * at all — they are never disputed and never block analysis; their accuracy is
 * measured separately, against ground truth, in eval/ocr/ (Task 4). Blocking a
 * tenant on a disagreement in how a label was phrased, when the deterministic
 * classifier downstream already tolerates lexical variation, would be friction with
 * no safety benefit.
 *
 * NO DEFAULTING TO THE HIGHER-CONFIDENCE PASS. A disputed amount or date has no
 * resolved value until a human enters one — see VerifiedLine.resolvedText, which is
 * `null` for `disputed` and `missing` by construction, not merely by convention.
 */

import type { BoundingBox, FieldClass, OcrLine, OcrResult } from "./ocr.ts";

export const BLOCKING_FIELD_CLASSES = ["amount", "date"] as const;
export type BlockingFieldClass = (typeof BLOCKING_FIELD_CLASSES)[number];

function isBlocking(fc: FieldClass): fc is BlockingFieldClass {
  return (BLOCKING_FIELD_CLASSES as readonly string[]).includes(fc);
}

export type FieldStatus =
  | "confirmed_auto" // both passes present, agree (blocking classes) or single-pass (non-blocking)
  | "disputed" // both passes present, disagree on the normalised figure — blocks analysis
  | "missing"; // one pass found nothing for this region — forces user entry

export interface VerifiedLine {
  field_class: FieldClass;
  page: number;
  bbox: BoundingBox;
  status: FieldStatus;
  pass_a: OcrLine | null;
  pass_b: OcrLine | null;
  /** The text to feed forward once resolved. Null for `disputed`/`missing` by
   *  construction — there is nothing to default to. */
  resolved_text: string | null;
  /** Set once a person has typed a correction or explicitly accepted the shown
   *  value — see app/(app)/taikyo/_screens/OcrConfirm.tsx. Distinct from
   *  resolved_text so a `confirmed_auto` line can still show what a human touched. */
  user_corrected: boolean;
}

/* ------------------------------------------------------------------ *
 * Normalisation — for COMPARISON only. The line's own displayed text
 * (line.text) is never altered; only the value used to decide agreement is.
 * ------------------------------------------------------------------ */

const FULLWIDTH_DIGITS: Record<string, string> = {
  "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
  "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
};

/** Strips everything but digits, after folding full-width numerals to half-width.
 *  「金120,000円」 and 「120000円」 and 「１２０，０００円」 all normalise to "120000". */
export function normaliseAmount(raw: string): string {
  const halfWidth = raw.replace(/[０-９]/g, (d) => FULLWIDTH_DIGITS[d] ?? d);
  return halfWidth.replace(/[^\d]/g, "");
}

const KANJI_ERA: Record<string, string> = { 令和: "R", 平成: "H", 昭和: "S", 大正: "T", 明治: "M" };

/** Folds a date to `<era><year><month><day>`, each of month/day zero-padded to two
 *  digits, so "令和7年4月1日", "2026年4月1日" and "2026-04-01" all compare correctly
 *  regardless of separator style AND regardless of whether the source used a
 *  leading zero — 「4月1日」 (no padding, ordinary Japanese usage) must normalise
 *  identically to "04/01" (Western-style, typically padded), or two passes reading
 *  the same date in different conventions would falsely dispute a real agreement.
 *  Era-vs-Gregorian conversion (令和7年 vs 2026年) is deliberately NOT attempted —
 *  out of scope here, and in practice both passes read the same source image, which
 *  uses one era convention consistently. */
export function normaliseDate(raw: string): string {
  const halfWidth = raw.replace(/[０-９]/g, (d) => FULLWIDTH_DIGITS[d] ?? d);
  let era = "";
  let rest = halfWidth;
  for (const [kanji, code] of Object.entries(KANJI_ERA)) {
    if (halfWidth.includes(kanji)) {
      era = code;
      rest = halfWidth.slice(halfWidth.indexOf(kanji) + kanji.length);
      break;
    }
  }
  const groups = rest.match(/\d+/g) ?? [];
  const padded = groups.map((g, i) => (i === 0 ? g : g.padStart(2, "0")));
  return era + padded.join("");
}

function normalise(fieldClass: BlockingFieldClass, text: string): string {
  return fieldClass === "amount" ? normaliseAmount(text) : normaliseDate(text);
}

/* ------------------------------------------------------------------ *
 * Pairing lines across the two passes
 * ------------------------------------------------------------------ */

/** Intersection-over-union of two normalised bounding boxes. */
function iou(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const intersection = ix * iy;
  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}

/** A line from pass B counts as "the same field" as a line from pass A when their
 *  boxes overlap substantially on the same page — two independent transcriptions of
 *  a fixed-layout document (a 清算書's rows) should land on close to the same region
 *  even when the exact text differs, which is what makes this a meaningful safety
 *  check rather than a coincidence of ordering. */
const MIN_OVERLAP = 0.3;

interface Pairing {
  a: OcrLine | null;
  b: OcrLine | null;
}

function pairLines(passA: OcrResult, passB: OcrResult): Pairing[] {
  const bByPage = new Map<number, OcrLine[]>();
  for (const line of passB.lines) {
    const list = bByPage.get(line.page) ?? [];
    list.push(line);
    bByPage.set(line.page, list);
  }

  const usedB = new Set<OcrLine>();
  const pairings: Pairing[] = [];

  for (const a of passA.lines) {
    const candidates = bByPage.get(a.page) ?? [];
    let best: OcrLine | null = null;
    let bestScore = 0;
    for (const b of candidates) {
      if (usedB.has(b)) continue;
      const score = iou(a.bbox, b.bbox);
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best !== null && bestScore >= MIN_OVERLAP) {
      usedB.add(best);
      pairings.push({ a, b: best });
    } else {
      pairings.push({ a, b: null });
    }
  }

  // Anything left in pass B matched nothing in pass A — pass A missed it.
  for (const list of bByPage.values()) {
    for (const b of list) {
      if (!usedB.has(b)) pairings.push({ a: null, b });
    }
  }

  return pairings;
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

export function verifyDualPass(passA: OcrResult, passB: OcrResult): VerifiedLine[] {
  const pairings = pairLines(passA, passB);
  const out: VerifiedLine[] = [];

  for (const { a, b } of pairings) {
    const source = a ?? b!;
    const fieldClass = source.field_class;
    const page = source.page;
    const bbox = source.bbox;

    if (a === null || b === null) {
      out.push({
        field_class: fieldClass, page, bbox, status: "missing",
        pass_a: a, pass_b: b, resolved_text: null, user_corrected: false,
      });
      continue;
    }

    if (!isBlocking(fieldClass)) {
      // Non-blocking classes: no dispute mechanism, pass A's transcription is the
      // working value, always user-editable downstream regardless.
      out.push({
        field_class: fieldClass, page, bbox, status: "confirmed_auto",
        pass_a: a, pass_b: b, resolved_text: a.text, user_corrected: false,
      });
      continue;
    }

    const normA = normalise(fieldClass, a.text);
    const normB = normalise(fieldClass, b.text);
    if (normA.length > 0 && normA === normB) {
      out.push({
        field_class: fieldClass, page, bbox, status: "confirmed_auto",
        pass_a: a, pass_b: b, resolved_text: a.text, user_corrected: false,
      });
    } else {
      // Disagreement, or both passes read an empty/unparseable figure — either way
      // there is nothing safe to carry forward automatically.
      out.push({
        field_class: fieldClass, page, bbox, status: "disputed",
        pass_a: a, pass_b: b, resolved_text: null, user_corrected: false,
      });
    }
  }

  return out.sort((x, y) => x.page - y.page || x.bbox.y - y.bbox.y || x.bbox.x - y.bbox.x);
}

/** True while any line still needs a human decision before analysis can run. */
export function hasUnresolvedLines(lines: readonly VerifiedLine[]): boolean {
  return lines.some((l) => (l.status === "disputed" || l.status === "missing") && !l.user_corrected);
}

export interface DisagreementStats {
  totalBlockingFields: number;
  disputed: number;
  missing: number;
  /** disputed / (disputed + confirmed_auto), among blocking-class fields only — the
   *  number the ticket calls "the single best measure of whether this pipeline is
   *  safe on real input." Missing fields are reported separately since they are a
   *  different failure mode (one pass found nothing) from a genuine disagreement. */
  disagreementRate: number;
}

export function disagreementStats(lines: readonly VerifiedLine[]): DisagreementStats {
  const blocking = lines.filter((l) => isBlocking(l.field_class));
  const disputed = blocking.filter((l) => l.status === "disputed").length;
  const missing = blocking.filter((l) => l.status === "missing").length;
  const comparable = blocking.length - missing;
  return {
    totalBlockingFields: blocking.length,
    disputed,
    missing,
    disagreementRate: comparable > 0 ? disputed / comparable : 0,
  };
}

/** Applies a user's typed correction (or explicit accept-as-shown) to one line. */
export function resolveLine(line: VerifiedLine, correctedText: string): VerifiedLine {
  return { ...line, status: "confirmed_auto", resolved_text: correctedText, user_corrected: true };
}
