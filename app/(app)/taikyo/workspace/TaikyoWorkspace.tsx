"use client";

/**
 * The real 原状回復 funnel — S1 ingest through S4 unlock, built from the same
 * presentational components _screens/Screens.tsx mounts against fixtures at
 * /taikyo/preview in V14. V15 retires that preview and wires these to the real
 * engine (batch-evaluate, extract), persistence (POST /api/taikyo/audits) and
 * Shopify Checkout (GET /api/taikyo/checkout) — the swap V14's own docstring
 * anticipated.
 *
 * The paid side (S5 report, S6 letter) does NOT continue in this component: a buyer
 * leaves for Shopify Checkout and receives their report link by email (see
 * lib/server/mail.ts for why — there is no reliable redirect back into this session
 * from a headless Shopify Checkout). That side lives at /taikyo/r/[id]
 * (PaidReportView.tsx), reached from the emailed link, not from continuing this flow.
 */

import { useCallback, useState } from "react";
import "../_design/tokens.css";
import { S1Ingest, S2Confirm, S3Result, S4Unlock } from "../_screens/Screens";
import s from "../_screens/screens.module.css";
import { toDemoLine, recoverableTotal, sumsByTier } from "@/lib/shared/finding-view.ts";
import {
  DELIVERABLES, PAYMENT_METHODS, SKUS,
} from "@/lib/fixtures/taikyo-demo.ts";
import {
  EvaluateError,
  evaluateContractText,
  extractPdfText,
  type BatchReportResponse,
} from "@/lib/shared/taikyo-client.ts";

type Step = "ingest" | "confirm" | "result" | "unlock";

export default function TaikyoWorkspace() {
  const [step, setStep] = useState<Step>("ingest");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [report, setReport] = useState<BatchReportResponse | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [persisting, setPersisting] = useState(false);

  const runAnalysis = useCallback(async (contractText: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await evaluateContractText(contractText);
      if (result.clausesEvaluated === 0) {
        setError("原状回復に関する条項が見つかりませんでした。契約書の条文をそのまま貼り付けてください。");
        return;
      }
      setReport(result);
      setStep("confirm");
    } catch (e) {
      setError(e instanceof EvaluateError ? e.message : "診断に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setRefused(false);
    try {
      const result = await extractPdfText(file);
      if (!result.ok) {
        setRefused(true);
        setError(result.messageJa);
        return;
      }
      setText(result.text);
      await runAnalysis(result.text);
    } catch (e) {
      setError(e instanceof EvaluateError ? e.message : "ファイルの読み取りに失敗しました。");
      setBusy(false);
    }
  }, [runAnalysis]);

  const handleSubmitText = useCallback(() => {
    void runAnalysis(text.trim());
  }, [text, runAnalysis]);

  const lines = report ? report.findings.map(toDemoLine) : [];
  const sums = sumsByTier(lines);
  const recoverable = recoverableTotal(sums);
  const total = lines.reduce((n, l) => n + l.chargedJpy, 0);
  const allSound = recoverable === 0;

  const handleConfirm = useCallback(async () => {
    if (!report) return;
    // Nothing to sell when every clause is sound — skip persistence and the paywall
    // entirely, matching S4's own promise: "争える項目がない場合、課金画面は表示されません。"
    if (allSound) {
      setStep("result");
      return;
    }
    setPersisting(true);
    setError(null);
    try {
      const res = await fetch("/api/taikyo/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contract_text: text.trim(), report }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "保存に失敗しました。");
      setAuditId(body.auditId as string);
      setStep("result");
    } catch {
      setError("保存に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setPersisting(false);
    }
  }, [report, allSound, text]);

  return (
    <main className="doc">
      <div className={s.wrap}>
        {step === "ingest" && (
          <S1Ingest
            refused={refused}
            text={text}
            onTextChange={(v) => { setText(v); if (refused) setRefused(false); }}
            onFile={(f) => void handleFile(f)}
            onSubmit={handleSubmitText}
            busy={busy}
            error={error}
          />
        )}

        {step === "confirm" && report && (
          <S2Confirm lines={lines} onConfirm={() => void handleConfirm()} busy={persisting} />
        )}

        {step === "result" && report && (
          <S3Result
            lines={lines}
            total={total}
            recoverable={recoverable}
            sums={sums}
            masked={!allSound}
            onUnlock={() => setStep("unlock")}
          />
        )}

        {step === "unlock" && auditId && (
          <S4Unlock
            skus={SKUS}
            deliverables={DELIVERABLES}
            methods={PAYMENT_METHODS}
            checkoutHref={`/api/taikyo/checkout?audit_id=${auditId}`}
          />
        )}
      </div>
    </main>
  );
}
