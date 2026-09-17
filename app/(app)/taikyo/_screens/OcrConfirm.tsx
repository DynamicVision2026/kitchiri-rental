"use client";

/**
 * Region-linked OCR confirmation — V16 Task 3, the safety mechanism the whole
 * pipeline depends on.
 *
 * The tenant is holding the paper. This screen exists to make the literal act of
 * comparing "what the photo shows here" against "what we read" as close to free as
 * possible: every line shows a zoomed crop of the exact region of the photo it came
 * from (via bbox), not the whole photo, so there is no hunting.
 *
 * - Disputed and missing fields are listed FIRST, visually distinct (accent border,
 *   an open input rather than a confirm button), because those are the ones that
 *   actually need a decision.
 * - Every field is editable, always — not just disputed ones. Confidence is a
 *   signal, not a gate.
 * - Nothing collapses. A `<details>` a user never opens is a field never checked.
 */

import { useMemo, useState, type CSSProperties } from "react";
import type { VerifiedLine } from "@/lib/ingest/dual-pass.ts";
import s from "./ocr-confirm.module.css";

const FIELD_LABEL_JA: Record<VerifiedLine["field_class"], string> = {
  amount: "金額", date: "日付", name: "氏名・当事者名", label: "費目", other: "その他",
};

/** CSS background-position/size trick to zoom a `background-image` to a normalised
 *  0-1 bounding box, with a fixed margin so the crop shows a little context around
 *  the field rather than cutting exactly at its edge. */
function cropStyle(imageUrl: string, bbox: VerifiedLine["bbox"]): CSSProperties {
  const margin = 0.35; // extra context around the field, as a fraction of its own size
  const x = Math.max(0, bbox.x - bbox.w * margin);
  const y = Math.max(0, bbox.y - bbox.h * margin);
  const w = Math.min(1 - x, bbox.w * (1 + margin * 2));
  const h = Math.min(1 - y, bbox.h * (1 + margin * 2));
  const safeW = Math.max(w, 0.02);
  const safeH = Math.max(h, 0.02);
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundSize: `${100 / safeW}% ${100 / safeH}%`,
    backgroundPosition:
      safeW < 1 && safeH < 1
        ? `${(x / (1 - safeW)) * 100}% ${(y / (1 - safeH)) * 100}%`
        : "0% 0%",
    backgroundRepeat: "no-repeat",
  };
}

interface LineRowProps {
  line: VerifiedLine;
  imageUrl: string | undefined;
  value: string;
  onChange: (text: string) => void;
  autoFocus?: boolean;
}

function LineRow({ line, imageUrl, value, onChange, autoFocus }: LineRowProps) {
  const disputed = line.status === "disputed" || line.status === "missing";
  return (
    <div className={`${s.row} ${disputed ? s.rowDisputed : ""}`}>
      <div className={s.crop} style={imageUrl ? cropStyle(imageUrl, line.bbox) : undefined} aria-hidden="true" />
      <div className={s.rowBody}>
        <div className={s.rowHead}>
          <span className={s.fieldTag}>{FIELD_LABEL_JA[line.field_class]}</span>
          {line.status === "disputed" && <span className={s.disputeTag}>2回の読み取りが一致しません — ご確認ください</span>}
          {line.status === "missing" && <span className={s.disputeTag}>読み取れませんでした — ご入力ください</span>}
        </div>
        <label className={s.fieldLabel}>
          写真の該当箇所と見比べて、正しい内容を入力してください
          <input
            className={`${s.input} ${disputed ? s.inputDisputed : ""}`}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus={autoFocus}
            aria-invalid={disputed}
          />
        </label>
        {line.status === "disputed" && (
          <p className={s.hint}>
            1回目の読み取り：「{line.pass_a?.text}」　/　2回目の読み取り：「{line.pass_b?.text}」
          </p>
        )}
      </div>
    </div>
  );
}

export interface OcrConfirmProps {
  lines: VerifiedLine[];
  /** page number -> an object URL (or any renderable <img> src) for that photo. */
  imagesByPage: Map<number, string>;
  onConfirm: (resolvedLines: { line: VerifiedLine; text: string }[]) => void;
  busy?: boolean;
}

export default function OcrConfirm({ lines, imagesByPage, onConfirm, busy = false }: OcrConfirmProps) {
  // Working copy of every line's text, keyed by array index (lines is a stable,
  // already-sorted snapshot from the API response for the duration of this screen).
  const [values, setValues] = useState<string[]>(() => lines.map((l) => l.resolved_text ?? ""));

  const { blocking, resolved } = useMemo(() => {
    const blockingIdx: number[] = [];
    const resolvedIdx: number[] = [];
    lines.forEach((l, i) => {
      if (l.status === "disputed" || l.status === "missing") blockingIdx.push(i);
      else resolvedIdx.push(i);
    });
    return { blocking: blockingIdx, resolved: resolvedIdx };
  }, [lines]);

  const remaining = blocking.filter((i) => values[i].trim().length === 0).length;
  const canConfirm = remaining === 0;

  const setValue = (i: number, text: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[i] = text;
      return next;
    });
  };

  return (
    <div className={s.wrap}>
      <ol className={s.steps}>
        <li>契約書と精算書を入力する</li>
        <li className={s.stepOn}>読み取り結果を確認する</li>
        <li>判定結果を見る</li>
      </ol>

      <h1 className={s.h1}>写真から読み取った内容をご確認ください</h1>
      <p className={s.muted}>
        お手元の書類と見比べながら、1項目ずつご確認ください。
        {blocking.length > 0
          ? ` 特に、${blocking.length}件は2回の読み取りが一致しなかった、または読み取れなかった項目です。まずこちらからご確認ください。`
          : " すべての項目で2回の読み取りが一致しています。念のため内容をご確認ください。"}
      </p>

      {blocking.length > 0 && (
        <>
          <h2 className={s.h2}>ご確認が必要な項目（{blocking.length}件）</h2>
          {blocking.map((i, order) => (
            <LineRow
              key={i}
              line={lines[i]}
              imageUrl={imagesByPage.get(lines[i].page)}
              value={values[i]}
              onChange={(t) => setValue(i, t)}
              autoFocus={order === 0}
            />
          ))}
        </>
      )}

      {resolved.length > 0 && (
        <>
          <h2 className={s.h2}>2回の読み取りが一致した項目（{resolved.length}件）</h2>
          <p className={s.tiny}>こちらも編集できます。金額など重要な項目は念のためご確認ください。</p>
          {resolved.map((i) => (
            <LineRow
              key={i}
              line={lines[i]}
              imageUrl={imagesByPage.get(lines[i].page)}
              value={values[i]}
              onChange={(t) => setValue(i, t)}
            />
          ))}
        </>
      )}

      <div className={s.actions}>
        <button
          className={s.btn}
          type="button"
          disabled={!canConfirm || busy}
          onClick={() => onConfirm(lines.map((line, i) => ({ line, text: values[i] })))}
        >
          {busy ? "判定中…" : canConfirm ? "この内容で判定する" : `あと${remaining}件、ご確認が必要です`}
        </button>
      </div>
    </div>
  );
}
