/**
 * Pure scoring logic for the OCR accuracy harness — separated from run.ts (which
 * needs real files and a real/mock engine to do anything) so the matching and
 * accuracy arithmetic itself can be unit-tested against hand-built fixtures. See
 * tests/fixtures/ocr-scoring-check.ts.
 */

import { normaliseAmount, normaliseDate, type VerifiedLine } from "../../lib/ingest/dual-pass.ts";
import type { FieldClass } from "../../lib/ingest/ocr.ts";

export interface GroundTruthField {
  field_class: FieldClass;
  text: string;
}

export interface GroundTruthSample {
  id: string;
  fields: GroundTruthField[];
}

export interface MatchedField {
  field_class: FieldClass;
  groundTruth: string;
  /** What the OCR line (pre-confirmation) actually said — pass A's reading, since
   *  pre-confirmation accuracy asks "how good is a single pass," not "how good is
   *  the pair." Null if no OCR line was found to pair with this ground-truth
   *  field at all (the engine missed it outright). */
  preConfirmation: string | null;
  /** What reaches the engine after the confirmation model in
   *  lib/ingest/dual-pass.ts runs: the agreed value for a `confirmed_auto` line,
   *  or — modelling an assumed-correct human confirmation, see this module's
   *  file-level comment in eval/ocr/README.md — the ground truth itself for a
   *  `disputed`/`missing` line. The one case this can still be wrong is a
   *  `confirmed_auto` line where both passes agreed on the SAME wrong value;
   *  dual-pass verification cannot catch that by construction. */
  postConfirmation: string | null;
  status: VerifiedLine["status"];
}

function normaliseForCompare(fieldClass: FieldClass, text: string): string {
  if (fieldClass === "amount") return normaliseAmount(text);
  if (fieldClass === "date") return normaliseDate(text);
  // name/label/other: compare trimmed, whitespace-collapsed text directly — there
  // is no numeral-style normalisation question for these classes.
  return text.trim().replace(/\s+/g, "");
}

/**
 * Pairs ground-truth fields to VerifiedLine entries by field class and reading
 * order (VerifiedLine[] arrives already sorted page/y/x by verifyDualPass — see
 * this file's README for why this pairing is unvalidated against real layouts).
 */
export function matchToGroundTruth(lines: readonly VerifiedLine[], sample: GroundTruthSample): MatchedField[] {
  const byClass = new Map<FieldClass, VerifiedLine[]>();
  for (const l of lines) {
    const list = byClass.get(l.field_class) ?? [];
    list.push(l);
    byClass.set(l.field_class, list);
  }
  const cursors = new Map<FieldClass, number>();

  return sample.fields.map((gt) => {
    const pool = byClass.get(gt.field_class) ?? [];
    const cursor = cursors.get(gt.field_class) ?? 0;
    const line = pool[cursor] ?? null;
    cursors.set(gt.field_class, cursor + 1);

    if (!line) {
      return { field_class: gt.field_class, groundTruth: gt.text, preConfirmation: null, postConfirmation: null, status: "missing" };
    }

    const preConfirmation = line.pass_a?.text ?? line.pass_b?.text ?? null;
    const postConfirmation =
      line.status === "confirmed_auto"
        ? line.resolved_text
        : gt.text; // modelled: a human resolves a disputed/missing field correctly

    return { field_class: gt.field_class, groundTruth: gt.text, preConfirmation, postConfirmation, status: line.status };
  });
}

export interface FieldClassAccuracy {
  field_class: FieldClass;
  total: number;
  preConfirmationCorrect: number;
  postConfirmationCorrect: number;
  preConfirmationRate: number;
  postConfirmationRate: number;
}

export function accuracyByFieldClass(matches: readonly MatchedField[]): FieldClassAccuracy[] {
  const classes: FieldClass[] = ["amount", "date", "name", "label", "other"];
  return classes
    .map((fc) => {
      const rows = matches.filter((m) => m.field_class === fc);
      if (rows.length === 0) return null;
      const pre = rows.filter((r) => r.preConfirmation !== null && normaliseForCompare(fc, r.preConfirmation) === normaliseForCompare(fc, r.groundTruth)).length;
      const post = rows.filter((r) => r.postConfirmation !== null && normaliseForCompare(fc, r.postConfirmation) === normaliseForCompare(fc, r.groundTruth)).length;
      return {
        field_class: fc, total: rows.length,
        preConfirmationCorrect: pre, postConfirmationCorrect: post,
        preConfirmationRate: pre / rows.length, postConfirmationRate: post / rows.length,
      };
    })
    .filter((x): x is FieldClassAccuracy => x !== null);
}

/** The ticket's own Task 4 gate table. Only postConfirmationRate is gating — pre is
 *  reported for visibility into engine quality, never used to block launch. */
export const ACCURACY_GATES: Readonly<Record<FieldClass, number | null>> = {
  amount: 0.99, date: 0.98, name: 0.90, label: 0.85, other: null,
};

export function gateResult(acc: FieldClassAccuracy): "pass" | "fail" | "not_gated" {
  const gate = ACCURACY_GATES[acc.field_class];
  if (gate === null) return "not_gated";
  return acc.postConfirmationRate >= gate ? "pass" : "fail";
}
