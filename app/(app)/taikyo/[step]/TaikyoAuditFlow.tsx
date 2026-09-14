"use client";

/**
 * 原状回復 audit flow — paste a clause, answer only what the engine actually needs,
 * read the verdict and the remedy.
 *
 * The middle step is the point of the whole component. The engine returns "unknown"
 * for any prong it cannot honestly decide, and each unknown comes back as a
 * FactRequest naming the one missing fact behind it. This screen renders those and
 * nothing else — it never asks a question that would not change the answer, and it
 * never asks the user for a legal conclusion, only for what a document says.
 */

import { useCallback, useMemo, useState } from "react";
import {
  EvaluateError,
  applyAnswer,
  evaluateClause,
  isAnswered,
  type AnswerValue,
  type EvaluationResponse,
  type EvaluateInput,
  type FactRequest,
} from "@/lib/shared/taikyo-client.ts";
import styles from "./flow.module.css";

const STEPS = ["clause", "facts", "result"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  clause: "1. 条文を入力",
  facts: "2. 不足情報の確認",
  result: "3. 判定結果",
};

const PRONG_LABELS = {
  P1: "P1 明確性",
  P2: "P2 所在",
  P3: "P3 相当性",
  P4: "P4 621条",
} as const;

function prongCell(value: boolean | "unknown") {
  if (value === true) return <span className={styles.yes}>満たす</span>;
  if (value === false) return <span className={styles.no}>満たさない</span>;
  return <span className={styles.unk}>不明</span>;
}

function emptyRequest(clause: string): EvaluateInput {
  return { clause_text: clause, placement: "unknown", context: null, code: null };
}

export default function TaikyoAuditFlow({ initialStep }: { initialStep: Step }) {
  const [step, setStep] = useState<Step>(initialStep === "result" ? "clause" : initialStep);
  const [clause, setClause] = useState("");
  const [request, setRequest] = useState<EvaluateInput | null>(null);
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (input: EvaluateInput) => {
    setBusy(true);
    setError(null);
    try {
      const evaluation = await evaluateClause(input);
      setRequest(input);
      setResult(evaluation);
      setAnswers({});
      setStep(evaluation.missingFacts.length > 0 ? "facts" : "result");
    } catch (e) {
      setError(e instanceof EvaluateError ? e.message : "判定に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  }, []);

  const asks: FactRequest[] = result?.missingFacts ?? [];
  const allAnswered = useMemo(
    () => asks.length > 0 && asks.every((a) => isAnswered(a.kind, answers[a.id])),
    [asks, answers],
  );

  const submitAnswers = useCallback(() => {
    if (!request) return;
    let next = request;
    for (const ask of asks) {
      const value = answers[ask.id];
      if (isAnswered(ask.kind, value)) next = applyAnswer(next, ask.path, value);
    }
    void run(next);
  }, [request, asks, answers, run]);

  const restart = () => {
    setStep("clause"); setClause(""); setRequest(null); setResult(null); setAnswers({}); setError(null);
  };

  return (
    <div className={styles.shell}>
      <h1 className={styles.h1}>原状回復 特約診断</h1>
      <p className={styles.sub}>
        賃貸借契約の特約条項を貼り付けると、民法621条および国土交通省ガイドラインに照らして
        4つの観点（明確性・所在・相当性・621条）から判定します。
      </p>

      <ol className={styles.steps}>
        {STEPS.map((s) => {
          const done = STEPS.indexOf(s) < STEPS.indexOf(step);
          return (
            <li key={s} className={`${styles.step} ${s === step ? styles.stepOn : done ? styles.stepDone : ""}`}>
              {STEP_LABELS[s]}
            </li>
          );
        })}
      </ol>

      {step === "clause" && (
        <div className={styles.card}>
          <label className={styles.label} htmlFor="clause">契約書の特約条項をそのまま貼り付けてください</label>
          <textarea
            id="clause"
            className={styles.textarea}
            value={clause}
            onChange={(e) => setClause(e.target.value)}
            placeholder="例：賃借人は、退去時のハウスクリーニング費用として金30,000円を負担するものとする。"
          />
          <p className={styles.help}>複数の条項がある場合は、1つずつ入力してください。</p>
          <div className={styles.row}>
            <button className={styles.btn} disabled={clause.trim().length === 0 || busy} onClick={() => void run(emptyRequest(clause.trim()))}>
              {busy ? "判定中…" : "判定する"}
            </button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}

      {step === "facts" && result && (
        <>
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>判定に必要な情報が不足しています</h2>
            <p className={styles.help}>
              条文だけでは判断できない点があります。以下にお答えいただくと判定が確定します。
              分からない項目は空欄のままでも構いません（その場合は「要確認」となります）。
            </p>
          </div>

          {asks.map((ask) => (
            <div key={ask.id} className={styles.card}>
              <span className={styles.label}>
                {ask.questionJa}
                <span className={styles.unblocks}>（{ask.unblocks.map((p) => PRONG_LABELS[p]).join("・")}の判定に必要）</span>
              </span>

              {ask.kind === "choice" && (
                <div className={styles.choices}>
                  {ask.options?.map((opt) => (
                    <label key={opt.value} className={`${styles.choice} ${answers[ask.id] === opt.value ? styles.choiceOn : ""}`}>
                      <input
                        type="radio"
                        name={ask.id}
                        value={opt.value}
                        checked={answers[ask.id] === opt.value}
                        onChange={() => setAnswers((a) => ({ ...a, [ask.id]: opt.value }))}
                      />
                      {opt.labelJa}
                    </label>
                  ))}
                </div>
              )}

              {ask.kind === "boolean" && (
                <div className={styles.choices}>
                  {[
                    { v: true, label: "はい、記載されている" },
                    { v: false, label: "いいえ、記載がない" },
                  ].map((o) => (
                    <label key={String(o.v)} className={`${styles.choice} ${answers[ask.id] === o.v ? styles.choiceOn : ""}`}>
                      <input
                        type="radio"
                        name={ask.id}
                        checked={answers[ask.id] === o.v}
                        onChange={() => setAnswers((a) => ({ ...a, [ask.id]: o.v }))}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}

              {ask.kind === "number" && (
                <div>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={typeof answers[ask.id] === "number" ? String(answers[ask.id]) : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setAnswers((a) => {
                        const next = { ...a };
                        if (raw === "") delete next[ask.id];
                        else next[ask.id] = Number(raw);
                        return next;
                      });
                    }}
                  />
                  {ask.unit && <span className={styles.unit}>{ask.unit}</span>}
                </div>
              )}

              <p className={styles.help}>{ask.helpJa}</p>
            </div>
          ))}

          <div className={styles.row}>
            <button className={styles.btn} disabled={busy} onClick={submitAnswers}>
              {busy ? "判定中…" : allAnswered ? "回答して判定する" : "この内容で判定する"}
            </button>
            <button className={styles.btnGhost} onClick={() => setStep("result")}>回答せずに結果を見る</button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </>
      )}

      {step === "result" && result && (
        <>
          <div className={styles.card}>
            <span className={`${styles.verdict} ${styles[result.verdict]}`}>{result.remedy.labelJa}</span>
            <p className={styles.remedy}>{result.remedy.tenantMessageJa}</p>
            <p className={styles.remedyEn}>{result.remedy.tenantMessageEn}</p>
            <p className={styles.meta}>
              分類：{result.code ?? "判定不能"}
              {result.code && !result.classification.confident && "（確信度が低いため要確認）"}
            </p>
          </div>

          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>4要件の判定</h2>
            <table className={styles.table}>
              <thead>
                <tr><th>要件</th><th>判定</th><th>判定理由</th></tr>
              </thead>
              <tbody>
                {(["P1", "P2", "P3", "P4"] as const).map((p) => (
                  <tr key={p}>
                    <th scope="row">{PRONG_LABELS[p]}</th>
                    <td>{prongCell(result.prongs[p])}</td>
                    <td>{result.reasonsText[p].ja}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.band && result.band.measured !== null && (
              <p className={styles.meta}>
                相当性バンド：測定値 {result.band.measured.toFixed(2)} ／ 目安 {result.band.supportedMax} 以下・
                上限 {result.band.elevatedMax} → 判定 {result.band.level}
              </p>
            )}
            {result.authorities.length > 0 && (
              <p className={styles.meta}>根拠：{result.authorities.join(" ／ ")}</p>
            )}
          </div>

          {result.missingFacts.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.sectionTitle}>未回答の項目があります</h2>
              <p className={styles.help}>
                以下にお答えいただくと、判定がより確定します：
                {result.missingFacts.map((f) => f.questionJa).join(" / ")}
              </p>
              <div className={styles.row}>
                <button className={styles.btnGhost} onClick={() => setStep("facts")}>不足情報を入力する</button>
              </div>
            </div>
          )}

          <div className={styles.row}>
            <button className={styles.btnGhost} onClick={restart}>別の条項を診断する</button>
          </div>
        </>
      )}

      <p className={styles.advisory}>{result?.advisory ?? "本診断は暫定版です。法的助言ではありません。"}</p>
    </div>
  );
}
