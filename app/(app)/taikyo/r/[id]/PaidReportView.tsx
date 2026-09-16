"use client";

import { useCallback, useMemo, useState } from "react";
import { S5Report, S6Letter } from "../../_screens/Screens";
import s from "../../_screens/screens.module.css";
import { toDemoLine, sumsByTier, recoverableTotal } from "@/lib/shared/finding-view.ts";
import {
  EvaluateError, generateLetter,
  type BatchFinding, type BatchReportResponse, type LetterClause, type Verdict,
} from "@/lib/shared/taikyo-client.ts";

const LETTERABLE = new Set<Verdict>(["unenforceable", "severable", "reducible", "needs_review"]);

export default function PaidReportView({
  auditId, report, expiresAt,
}: {
  auditId: string;
  report: BatchReportResponse;
  expiresAt: string;
}) {
  const findings = report.findings as BatchFinding[];
  // DemoLine.id is String(finding.index) — the SEGMENT index from segmentContract,
  // not the finding's position in this array (report.findings already excludes
  // unrecognised segments, so the two diverge as soon as any clause is skipped).
  // Every lookup from a line id back to its finding goes through this map, never
  // through findings[Number(id)].
  const byIndex = useMemo(() => new Map(findings.map((f) => [String(f.index), f])), [findings]);
  const lines = useMemo(() => findings.map(toDemoLine), [findings]);
  const sums = sumsByTier(lines);
  const recoverable = recoverableTotal(sums);
  const total = lines.reduce((n, l) => n + l.chargedJpy, 0);

  const letterableIds = useMemo(
    () => new Set(lines.filter((l) => LETTERABLE.has(byIndex.get(l.id)!.evaluation.verdict)).map((l) => l.id)),
    [lines, byIndex],
  );
  const [selected, setSelected] = useState<Set<string>>(letterableIds);
  const [letterText, setLetterText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const draft = useCallback(async () => {
    setDrafting(true);
    setCopied(false);
    setError(null);
    try {
      const clauses: LetterClause[] = findings
        .filter((f) => selected.has(String(f.index)))
        .map((f) => ({ label: f.label, clauseText: f.text, verdict: f.evaluation.verdict, code: f.evaluation.code, amountJpy: f.amounts.headlineJpy }));
      const result = await generateLetter(clauses);
      if (result.ok) setLetterText(result.text);
      else setError(result.reason);
    } catch (e) {
      setError(e instanceof EvaluateError ? e.message : "文面の作成に失敗しました。");
    } finally {
      setDrafting(false);
    }
  }, [findings, selected]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
    } catch {
      setError("クリップボードにコピーできませんでした。文面を選択して手動でコピーしてください。");
    }
  }, [letterText]);

  const letterableLines = lines.filter((l) => letterableIds.has(l.id));

  return (
    <main className="doc">
      <div className={s.wrap}>
        <p className={s.tiny}>この結果はこのリンクをお持ちの方のみご覧いただけます。保存期限：{new Date(expiresAt).toLocaleDateString("ja-JP")}まで</p>
        <S5Report lines={lines} total={total} recoverable={recoverable} pdfHref={`/api/taikyo/pdf/report/${auditId}`} />
        {letterableLines.length > 0 && (
          <>
            <hr className={s.sectionRule} />
            {error && <p className={s.tiny} style={{ color: "var(--accent)" }} role="alert">{error}</p>}
            <S6Letter
              lines={letterableLines}
              letterText={letterText}
              selected={selected}
              onToggle={toggle}
              onDraft={() => void draft()}
              drafting={drafting}
              pdfHref={letterText ? `/api/taikyo/pdf/letter/${auditId}` : undefined}
              onCopy={() => void copy()}
              copied={copied}
            />
          </>
        )}
      </div>
    </main>
  );
}
