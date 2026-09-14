"use client";

/**
 * Contract Health Dashboard — paste a whole lease, get a per-clause verdict map.
 *
 * Verdicts are STATUS values, so every one is rendered as colour + glyph + word. A
 * reader who cannot distinguish the hues still gets the finding from the label, and
 * the legend carries counts rather than relying on segment width.
 *
 * The exposure figure is presented as an upper bound with its caveats attached, and
 * money sitting behind an unanswered question is shown separately rather than folded
 * into the headline — a number a user might take to their landlord should never be
 * more confident than the analysis behind it.
 */

import { useCallback, useRef, useState } from "react";
import {
  EvaluateError,
  evaluateContractText,
  extractPdfText,
  generateLetter,
  type BatchFinding,
  type BatchReportResponse,
  type LetterClause,
  type LetterRefusal,
  type LetterResult,
  type IngestResult,
} from "@/lib/shared/taikyo-client.ts";
import styles from "./dashboard.module.css";

const VERDICT_ORDER = ["unenforceable", "severable", "reducible", "needs_review", "enforceable"] as const;
type VerdictKey = (typeof VERDICT_ORDER)[number];

/** Status role, glyph and label. Colour never carries the meaning on its own. */
const VERDICT_STYLE: Record<VerdictKey, { varName: string; glyph: string; labelJa: string }> = {
  unenforceable: { varName: "--critical", glyph: "✕", labelJa: "無効の可能性" },
  severable: { varName: "--serious", glyph: "◑", labelJa: "一部無効（範囲）" },
  reducible: { varName: "--warning", glyph: "▲", labelJa: "一部無効（金額）" },
  needs_review: { varName: "--neutral", glyph: "？", labelJa: "要確認" },
  enforceable: { varName: "--good", glyph: "✓", labelJa: "有効の可能性" },
};

const RISK_STYLE = {
  high: { varName: "--critical", labelJa: "リスク：高", glyph: "✕" },
  moderate: { varName: "--warning", labelJa: "リスク：中", glyph: "▲" },
  low: { varName: "--good", labelJa: "リスク：低", glyph: "✓" },
} as const;

const PRONG_LABELS = { P1: "P1 明確性", P2: "P2 所在", P3: "P3 相当性", P4: "P4 621条" } as const;

/** Verdicts a letter may be written about. Mirrors LETTERABLE_VERDICTS on the server,
 *  which is the authority — this only decides whether to show the button. */
const DISPUTABLE = new Set(["unenforceable", "severable", "reducible"]);

const toLetterClause = (f: BatchFinding): LetterClause => ({
  label: f.label,
  clauseText: f.text,
  verdict: f.evaluation.verdict,
  code: f.evaluation.code,
  amountJpy: f.amounts.headlineJpy,
});

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function prongMark(value: boolean | "unknown") {
  if (value === true) return "満たす";
  if (value === false) return "満たさない";
  return "不明";
}

function FindingCard({ finding, onDraft, busy }: {
  finding: BatchFinding;
  onDraft: (clauses: LetterClause[], title: string) => void;
  busy: boolean;
}) {
  const verdict = finding.evaluation.verdict as VerdictKey;
  const disputable = DISPUTABLE.has(verdict);
  const style = VERDICT_STYLE[verdict];
  return (
    <article className={styles.finding} style={{ borderLeftColor: `var(${style.varName})` }}>
      <div className={styles.findingHead}>
        <span className={styles.loc}>{finding.label}</span>
        <span className={styles.badge} style={{ color: `var(${style.varName})` }}>
          <span aria-hidden="true">{style.glyph}</span>
          {style.labelJa}
        </span>
        {finding.isTokuyakuSection && <span className={styles.tag}>特約</span>}
        {finding.evaluation.code && <span className={styles.tag}>{finding.evaluation.code}</span>}
        {finding.amounts.headlineJpy !== null && (
          <span className={styles.tag}>
            記載額 <span className={styles.amount}>{yen(finding.amounts.headlineJpy)}</span>
            {finding.amounts.ambiguous && " ※複数記載"}
          </span>
        )}
      </div>

      <p className={styles.clauseText}>{finding.text}</p>
      <p className={styles.remedy}>{finding.evaluation.remedy.tenantMessageJa}</p>

      {finding.evaluation.missingFacts.length > 0 && (
        <p className={styles.help}>
          判定を確定するには：{finding.evaluation.missingFacts.map((f) => f.questionJa).join(" / ")}
        </p>
      )}

      {disputable && (
        <div className={styles.letterActions}>
          <button
            className={styles.letterBtn}
            disabled={busy}
            onClick={() => onDraft([toLetterClause(finding)], `${finding.label} の交渉文面`)}
          >
            交渉文面を作成
          </button>
        </div>
      )}

      <details className={styles.details}>
        <summary>4要件の判定を見る</summary>
        <table className={styles.prongTable}>
          <thead>
            <tr><th>要件</th><th>判定</th><th>理由</th></tr>
          </thead>
          <tbody>
            {(["P1", "P2", "P3", "P4"] as const).map((p) => (
              <tr key={p}>
                <th scope="row">{PRONG_LABELS[p]}</th>
                <td>{prongMark(finding.evaluation.prongs[p])}</td>
                <td>{finding.reasonsText[p].ja}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </article>
  );
}

export default function ContractHealthDashboard() {
  const [text, setText] = useState("");
  const [report, setReport] = useState<BatchReportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [letter, setLetter] = useState<{ title: string; result: LetterResult | LetterRefusal } | null>(null);
  const [letterBusy, setLetterBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const analyze = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await evaluateContractText(text.trim()));
    } catch (e) {
      setError(e instanceof EvaluateError ? e.message : "診断に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  }, [text]);

  const takeFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setIngest(null);
    setReport(null);
    try {
      const result = await extractPdfText(file);
      setIngest(result);
      if (result.ok) {
        // Show what was read before judging it. Extraction can mangle a document, and
        // the user is the only one who can tell — so the text lands in the editable
        // box and the analysis runs on exactly what they can see.
        setText(result.text);
        setReport(await evaluateContractText(result.text));
      }
    } catch (e) {
      setError(e instanceof EvaluateError ? e.message : "ファイルの読み取りに失敗しました。");
    } finally {
      setBusy(false);
    }
  }, []);

  const draftLetter = useCallback(async (clauses: LetterClause[], title: string) => {
    setLetterBusy(true);
    setCopied(false);
    try {
      setLetter({ title, result: await generateLetter(clauses) });
    } catch (e) {
      setError(e instanceof EvaluateError ? e.message : "文面の作成に失敗しました。");
    } finally {
      setLetterBusy(false);
    }
  }, []);

  const copyLetter = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("クリップボードにコピーできませんでした。文面を選択して手動でコピーしてください。");
    }
  }, []);

  const downloadLetter = useCallback((text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "原状回復費用_確認再検討申入書.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const risk = report ? RISK_STYLE[report.riskLevel] : null;
  const disputableFindings = report ? report.findings.filter((f) => DISPUTABLE.has(f.evaluation.verdict)) : [];
  const present = report ? VERDICT_ORDER.filter((v) => report.verdictCounts[v] > 0) : [];

  return (
    <div className={styles.root}>
      <h1 className={styles.h1}>契約書 まるごと診断</h1>
      <p className={styles.sub}>
        賃貸借契約書の全文を貼り付けると、条文ごとに分割して原状回復・特約条項を一括で判定します。
        民法621条および国土交通省ガイドラインに基づく4要件（明確性・所在・相当性・621条）で評価します。
      </p>

      <div className={styles.card}>
        <div
          className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""} ${busy ? styles.dropZoneBusy : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file && !busy) void takeFile(file);
          }}
          onClick={() => !busy && fileInput.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) fileInput.current?.click(); }}
          role="button"
          tabIndex={0}
        >
          <div className={styles.dropTitle}>{busy ? "読み取り中…" : "契約書のPDFをここにドロップ、またはクリックして選択"}</div>
          <div className={styles.dropHint}>
            文字情報を含むPDFに対応しています（最大12MB）。スキャン画像のみのPDFは読み取れないため、その場合は本文を貼り付けてください。
          </div>
          <input
            ref={fileInput}
            className={styles.hiddenInput}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void takeFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {ingest && !ingest.ok && <p className={styles.ingestNote}>{ingest.messageJa}</p>}
        {ingest?.ok && (
          <p className={styles.ingestOk}>
            PDF から {ingest.pages} ページ・{ingest.text.length.toLocaleString()} 文字を読み取りました。内容をご確認ください。
          </p>
        )}

        <div className={styles.divider}>または本文を貼り付け</div>

        <label className={styles.loc} htmlFor="contract">契約書全文</label>
        <textarea
          id="contract"
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"第1条（契約の目的）\n　…\n\n特約事項\n　1. 退去時のハウスクリーニング費用として…"}
          style={{ marginTop: ".5rem" }}
        />
        <p className={styles.help}>第○条・項番号・特約事項の見出しを手がかりに自動で条項へ分割します。</p>
        <div className={styles.row}>
          <button className={styles.btn} disabled={text.trim().length === 0 || busy} onClick={() => void analyze()}>
            {busy ? "診断中…" : "契約書を診断する"}
          </button>
          {report && <button className={styles.btnGhost} onClick={() => { setReport(null); setText(""); setIngest(null); setLetter(null); }}>別の契約書を診断する</button>}
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      {report && (
        <>
          <h2 className={styles.sectionTitle}>診断サマリー</h2>
          <div className={styles.hero}>
            <div className={styles.heroMain}>
              <span className={styles.riskLabel} style={{ color: `var(${risk!.varName})` }}>
                <span className={styles.riskDot} style={{ background: `var(${risk!.varName})` }} aria-hidden="true" />
                <span aria-hidden="true">{risk!.glyph}</span>
                {risk!.labelJa}
              </span>
              <div className={styles.heroNumber}>{yen(report.exposure.statedJpy)}</div>
              <div className={styles.heroCaption}>
                争い得る金額の上限（契約書に記載された金額の合計）
                {report.exposure.rentMonths > 0 && ` ＋ 賃料${report.exposure.rentMonths}か月分`}
              </div>
              {report.exposure.unresolvedJpy > 0 && (
                <div className={styles.heroCaption} style={{ marginTop: ".4rem" }}>
                  別途 <strong>{yen(report.exposure.unresolvedJpy)}</strong>（{report.exposure.unresolvedCount}件）は情報不足のため未判定です。
                </div>
              )}
            </div>

            <div style={{ flex: "1 1 18rem" }}>
              <div className={styles.bar} role="img" aria-label={present.map((v) => `${VERDICT_STYLE[v].labelJa} ${report.verdictCounts[v]}件`).join("、")}>
                {present.map((v) => (
                  <div
                    key={v}
                    className={styles.barSeg}
                    style={{ flexGrow: report.verdictCounts[v], background: `var(${VERDICT_STYLE[v].varName})` }}
                  />
                ))}
              </div>
              <div className={styles.legend}>
                {present.map((v) => (
                  <span key={v} className={styles.legendItem}>
                    <span className={styles.swatch} style={{ background: `var(${VERDICT_STYLE[v].varName})` }} aria-hidden="true" />
                    <span aria-hidden="true">{VERDICT_STYLE[v].glyph}</span>
                    {VERDICT_STYLE[v].labelJa}
                    <span className={styles.legendCount}>{report.verdictCounts[v]}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.kpis}>
            <div className={styles.kpi}><div className={styles.kpiValue}>{report.totalSegments}</div><div className={styles.kpiLabel}>分割された条項</div></div>
            <div className={styles.kpi}><div className={styles.kpiValue}>{report.clausesEvaluated}</div><div className={styles.kpiLabel}>特約として判定</div></div>
            <div className={styles.kpi}><div className={styles.kpiValue}>{report.adverseCount}</div><div className={styles.kpiLabel}>問題のある条項</div></div>
            <div className={styles.kpi}><div className={styles.kpiValue}>{report.clausesSkipped}</div><div className={styles.kpiLabel}>通常条項（対象外）</div></div>
          </div>

          <ul className={styles.caveats}>
            {report.exposure.caveats.map((c) => <li key={c}>{c}</li>)}
          </ul>

          <h2 className={styles.sectionTitle}>条項ごとの判定（{report.findings.length}件）</h2>
          {disputableFindings.length > 0 && (
            <div className={styles.letterActions} style={{ marginBottom: "1rem" }}>
              <button
                className={styles.letterBtn}
                disabled={letterBusy}
                onClick={() => void draftLetter(disputableFindings.map(toLetterClause), `問題のある${disputableFindings.length}条項をまとめた交渉文面`)}
              >
                {letterBusy ? "作成中…" : `問題のある${disputableFindings.length}条項をまとめて交渉文面を作成`}
              </button>
            </div>
          )}

          {letter && (
            <section className={styles.letterPanel}>
              <div className={styles.letterHead}>
                <strong>{letter.title}</strong>
                <div className={styles.letterActions} style={{ marginTop: 0 }}>
                  {letter.result.ok && (
                    <>
                      <button className={styles.letterBtn} onClick={() => void copyLetter((letter.result as LetterResult).text)}>
                        {copied ? "コピーしました" : "コピー"}
                      </button>
                      <button className={styles.letterBtn} onClick={() => downloadLetter((letter.result as LetterResult).text)}>
                        テキストで保存
                      </button>
                    </>
                  )}
                  <button className={styles.letterBtn} onClick={() => setLetter(null)}>閉じる</button>
                </div>
              </div>

              {letter.result.ok ? (
                <>
                  <p className={styles.letterWarn}>
                    この文面は草案です。引用している判例・ガイドラインは一次資料での確認が未了のため、
                    送付前に内容をご確認のうえ、必要に応じて専門家にご相談ください。
                  </p>
                  <pre className={styles.letterText}>{letter.result.text}</pre>
                </>
              ) : (
                <p className={styles.letterRefusal}>{letter.result.reason}</p>
              )}
            </section>
          )}
          {[...report.findings]
            .sort((a, b) =>
              VERDICT_ORDER.indexOf(a.evaluation.verdict as VerdictKey) -
                VERDICT_ORDER.indexOf(b.evaluation.verdict as VerdictKey) || a.index - b.index)
            .map((f) => <FindingCard key={f.index} finding={f} onDraft={(c, t) => void draftLetter(c, t)} busy={letterBusy} />)}

          <p className={styles.advisory}>{report.advisory}</p>
        </>
      )}
    </div>
  );
}
