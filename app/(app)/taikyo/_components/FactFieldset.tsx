"use client";

/**
 * One missing-fact question, rendered the same way everywhere it is asked.
 *
 * The engine decides WHICH questions exist; this only draws them. Each question
 * names the prong it unblocks, because a user asked for their rent deserves to know
 * why — and because a question that cannot be traced to a prong should not have been
 * asked in the first place.
 */

import type { AnswerValue, FactRequest } from "@/lib/shared/taikyo-client.ts";
import styles from "./facts.module.css";

const PRONG_LABELS: Record<string, string> = {
  P1: "明確性", P2: "所在", P3: "相当性", P4: "621条",
};

export default function FactFieldset({
  fact,
  value,
  onChange,
  idPrefix,
}: {
  fact: FactRequest;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  idPrefix: string;
}) {
  const groupName = `${idPrefix}-${fact.id}`;
  const why = fact.unblocks.map((p) => PRONG_LABELS[p] ?? p).join("・");

  return (
    <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: "0.85rem 0 0" }}>
      <legend className={styles.label}>
        {fact.questionJa}
        <span className={styles.unblocks}>（{why}の判定に必要）</span>
      </legend>

      {fact.kind === "choice" && (
        <div className={styles.choices}>
          {fact.options?.map((opt) => (
            <label key={opt.value} className={`${styles.choice} ${value === opt.value ? styles.choiceOn : ""}`}>
              <input
                type="radio"
                name={groupName}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
              />
              <span>{opt.labelJa}</span>
            </label>
          ))}
        </div>
      )}

      {fact.kind === "boolean" && (
        <div className={styles.choices}>
          {[{ v: true, label: "はい、記載されている" }, { v: false, label: "いいえ、記載がない" }].map((o) => (
            <label key={String(o.v)} className={`${styles.choice} ${value === o.v ? styles.choiceOn : ""}`}>
              <input type="radio" name={groupName} checked={value === o.v} onChange={() => onChange(o.v)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}

      {fact.kind === "number" && (
        <div style={{ marginTop: ".45rem" }}>
          <input
            className={styles.number}
            type="number"
            min={0}
            inputMode="numeric"
            aria-label={fact.questionJa}
            value={typeof value === "number" ? String(value) : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw !== "") onChange(Number(raw));
            }}
          />
          {fact.unit && <span className={styles.unit}>{fact.unit}</span>}
        </div>
      )}

      <p className={styles.help}>{fact.helpJa}</p>
    </fieldset>
  );
}
