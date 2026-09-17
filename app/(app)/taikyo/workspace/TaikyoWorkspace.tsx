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

import { useCallback, useRef, useState } from "react";
import "../_design/tokens.css";
import { S1Ingest, S2Confirm, S3Result, S4Unlock } from "../_screens/Screens";
import OcrConfirm from "../_screens/OcrConfirm";
import s from "../_screens/screens.module.css";
import { toDemoLine, recoverableTotal, sumsByTier } from "@/lib/shared/finding-view.ts";
import { assembleConfirmedText } from "@/lib/ingest/assemble-text.ts";
import {
  DELIVERABLES, PAYMENT_METHODS, SKUS,
} from "@/lib/fixtures/taikyo-demo.ts";
import {
  EvaluateError,
  evaluateContractText,
  extractPdfText,
  type BatchReportResponse,
} from "@/lib/shared/taikyo-client.ts";
import { runOcr, OcrError, type OcrPageResult, type VerifiedLine } from "@/lib/shared/ocr-client.ts";

type Step = "ingest" | "ocr_confirm" | "confirm" | "result" | "unlock";

export default function TaikyoWorkspace() {
  const [step, setStep] = useState<Step>("ingest");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [report, setReport] = useState<BatchReportResponse | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [persisting, setPersisting] = useState(false);

  // V16: OCR ingest state. ocrLines is the flat, already-sorted (page, then
  // position) list of every OK page's VerifiedLine — the entire object the
  // confirmation screen and the eventual text assembly work from.
  const [ocrLines, setOcrLines] = useState<VerifiedLine[] | null>(null);
  const [ocrImages, setOcrImages] = useState<Map<number, string>>(new Map());
  const objectUrlsRef = useRef<string[]>([]);

  const revokeOcrImages = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current = [];
  }, []);

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

  /**
   * V16 Task 3 entry point. Every page is processed independently
   * (app/api/taikyo/ocr's own design); if ANY page comes back refused, the whole
   * submission stops here rather than silently proceeding on a partial read — a
   * settlement statement missing one of its rows is exactly the wrong-number risk
   * this pipeline exists to prevent, and the confirmation screen has no way to
   * represent "this page just isn't here."
   */
  const handlePhotos = useCallback(async (files: File[]) => {
    setBusy(true);
    setError(null);
    setRefused(false);
    revokeOcrImages();
    try {
      const response = await runOcr(files);
      const refusedPages = response.pages.filter((p): p is Extract<OcrPageResult, { ok: false }> => !p.ok);
      if (refusedPages.length > 0) {
        setRefused(true);
        setError(
          refusedPages.length === response.pages.length
            ? refusedPages[0].messageJa
            : `${refusedPages.map((p) => `${p.page}枚目：${p.messageJa}`).join(" ")}`,
        );
        return;
      }

      const urls = files.map((f) => URL.createObjectURL(f));
      objectUrlsRef.current = urls;
      const byPage = new Map<number, string>(urls.map((u, i) => [i + 1, u]));
      setOcrImages(byPage);

      const lines = response.pages.flatMap((p) => (p.ok ? p.lines : []));
      setOcrLines(lines);
      setStep("ocr_confirm");
    } catch (e) {
      setError(e instanceof OcrError ? e.message : "写真の読み取りに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  }, [revokeOcrImages]);

  /** The one place OCR output crosses into contract text — see
   *  lib/ingest/assemble-text.ts and, upstream of it, lib/ingest/ocr.ts's
   *  file-level comment on where the judgment boundary sits. Every line here has
   *  already been through OcrConfirm's canConfirm gate, so resolvedTexts contains
   *  no empty string for a line that was disputed or missing. */
  const handleOcrConfirm = useCallback((resolved: { line: VerifiedLine; text: string }[]) => {
    const assembled = assembleConfirmedText(
      resolved.map((r) => r.line),
      resolved.map((r) => r.text),
    );
    setText(assembled);
    revokeOcrImages();
    setOcrImages(new Map());
    setOcrLines(null);
    void runAnalysis(assembled);
  }, [runAnalysis, revokeOcrImages]);

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
            onPhotos={(files) => void handlePhotos(files)}
            onSubmit={handleSubmitText}
            busy={busy}
            error={error}
          />
        )}

        {step === "ocr_confirm" && ocrLines && (
          <OcrConfirm
            lines={ocrLines}
            imagesByPage={ocrImages}
            onConfirm={handleOcrConfirm}
            busy={busy}
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
