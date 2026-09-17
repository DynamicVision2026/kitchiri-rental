/**
 * Turns confirmed OCR lines into contract-shaped text the existing engine can
 * segment — the last step before `extracted_confirmed` reaches
 * evaluateContractText(), and the point where V16 hands off to code that has not
 * changed at all (lib/modules/taikyo/segment.ts, batch.ts, rules.ts).
 *
 * WHY THIS EXISTS: a photographed 清算書 is usually a flat table (費目 / 金額 rows),
 * not article-structured prose. lib/modules/taikyo/segment.ts splits on 第N条
 * markers, numbered items, or a 特約事項 heading — a flat table has none of those
 * by default. This module reconstructs the minimum structure segment.ts needs: a
 * 特約事項 heading followed by one numbered line per table row, each row built by
 * grouping OCR lines that share roughly the same vertical position (the same
 * printed row) and joining them left to right.
 *
 * THIS HEURISTIC IS UNVALIDATED. It has not been checked against a real
 * photographed settlement statement — see eval/ocr/README.md: there is no
 * ground-truth batch in this repo to validate row-grouping against, only
 * hand-built fixtures shaped like one. Before this reaches a real user, confirm
 * against Batches 1/2 (or whatever real photos exist) that row grouping actually
 * reconstructs each line item correctly, particularly for multi-column layouts
 * where a label and its amount are not simple left-right neighbours.
 */

import type { VerifiedLine } from "./dual-pass.ts";

/** Two lines are "the same row" when their vertical centres are within this
 *  fraction of the image height of each other. Wide enough to tolerate OCR's own
 *  imprecision in bbox placement, narrow enough not to merge genuinely separate
 *  rows on a dense table. */
const ROW_EPSILON = 0.02;

function yCentre(l: VerifiedLine): number {
  return l.bbox.y + l.bbox.h / 2;
}

interface AssembledLine {
  text: string;
}

export function assembleConfirmedText(
  lines: readonly VerifiedLine[],
  resolvedTextByIndex: readonly (string | null)[],
): string {
  // Resolve each line to its final text — a corrected/confirmed value, falling
  // back to whichever pass produced a reading if somehow nothing was recorded
  // (should not happen once every line is confirmed, but never emit "undefined").
  const resolved = lines.map((l, i) => {
    const text = resolvedTextByIndex[i] ?? l.resolved_text ?? l.pass_a?.text ?? l.pass_b?.text ?? "";
    return { line: l, text: text.trim() };
  }).filter((r) => r.text.length > 0);

  // Group into pages, preserving each page's own row order.
  const byPage = new Map<number, typeof resolved>();
  for (const r of resolved) {
    const list = byPage.get(r.line.page) ?? [];
    list.push(r);
    byPage.set(r.line.page, list);
  }

  const rows: AssembledLine[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageLines = [...byPage.get(page)!].sort((a, b) => yCentre(a.line) - yCentre(b.line) || a.line.bbox.x - b.line.bbox.x);
    let currentRow: typeof pageLines = [];
    let currentY: number | null = null;

    const flush = () => {
      if (currentRow.length === 0) return;
      const sorted = [...currentRow].sort((a, b) => a.line.bbox.x - b.line.bbox.x);
      rows.push({ text: sorted.map((r) => r.text).join("　") });
      currentRow = [];
    };

    for (const r of pageLines) {
      const y = yCentre(r.line);
      if (currentY === null || Math.abs(y - currentY) <= ROW_EPSILON) {
        currentRow.push(r);
        currentY = currentY === null ? y : (currentY + y) / 2;
      } else {
        flush();
        currentRow.push(r);
        currentY = y;
      }
    }
    flush();
  }

  if (rows.length === 0) return "";

  const numbered = rows.map((r, i) => `${i + 1}. ${r.text}`);
  return ["特約事項", ...numbered].join("\n");
}
