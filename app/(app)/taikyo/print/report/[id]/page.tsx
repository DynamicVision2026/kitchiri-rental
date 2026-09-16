import "../../../_design/tokens.css";
import s from "../../print.module.css";
import { getAuditStore, isAuditAccessible } from "@/lib/server/audit-store.ts";
import type { BatchFinding } from "@/lib/shared/taikyo-client.ts";

export const runtime = "nodejs";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const ADVERSE = new Set(["unenforceable", "severable", "reducible"]);

const VERDICT_LABEL: Record<string, string> = {
  unenforceable: "無効の可能性",
  severable: "一部無効（範囲）",
  reducible: "一部無効（金額）",
  needs_review: "要確認",
  enforceable: "有効の可能性",
};

function UnavailablePage({ status, message }: { status: string; message: string }) {
  return (
    <main className="doc">
      <div className={s.page}>
        <h1>{status}</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}

export default async function ReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getAuditStore().get(id);

  if (!record) return <UnavailablePage status="404 Not Found" message="該当する診断結果が見つかりませんでした。" />;
  if (record.revokedAt) return <UnavailablePage status="403 Forbidden" message="この購入は返金処理済みのため、レポートをご利用いただけません。" />;
  if (!isAuditAccessible(record)) return <UnavailablePage status="410 Gone" message="この診断結果は保存期間（90日間）を過ぎたため、削除されました。" />;

  const report = record.report;
  const findings = report.findings as BatchFinding[];
  const adverse = findings.filter((f) => ADVERSE.has(f.evaluation.verdict));
  const recoverable = adverse.reduce((n, f) => n + (f.amounts.headlineJpy ?? 0), 0);

  return (
    <main className="doc">
      <div className={s.page}>
        <div className={s.masthead}>
          <h1 className={s.mastheadTitle}>原状回復費用 診断結果</h1>
          <div className={s.mastheadMeta}>
            <div>発行日：{new Date(record.paidAt ?? record.createdAt).toLocaleDateString("ja-JP")}</div>
            <div className="num">照会番号：{record.id}</div>
          </div>
        </div>

        <p className={s.summaryLine}>
          ご請求 <span className="num">{yen(report.exposure.statedJpy + report.exposure.unresolvedJpy)}</span> のうち
        </p>
        <p className={`${s.summaryFigure} num`}>{yen(recoverable)}</p>
        <p className={s.summaryLine}>が貸主負担となる可能性があります。</p>

        {report.exposure.caveats.map((c, i) => (
          <p key={i} className={s.lineMeta}>※ {c}</p>
        ))}

        <h2 style={{ marginTop: "2rem" }}>項目ごとの内訳（{findings.length}件）</h2>
        {findings.map((f) => (
          <div key={f.index} className={s.lineRow}>
            <strong>{f.label}</strong>
            <span className={`${s.lineAmt} num`}>{f.amounts.headlineJpy != null ? yen(f.amounts.headlineJpy) : "—"}</span>
            <p className={s.lineMeta}>{VERDICT_LABEL[f.evaluation.verdict] ?? f.evaluation.verdict}{f.evaluation.code ? `　${f.evaluation.code}` : ""}</p>
            <p className={s.lineReason}>{f.evaluation.remedy.tenantMessageJa}</p>
            {f.evaluation.authorities.length > 0 && (
              <p className={s.lineCite}>根拠：{f.evaluation.authorities.join(" ／ ")}</p>
            )}
          </div>
        ))}

        <div className={s.totalsRow}>
          <span>貸主負担となる可能性がある金額（合計）</span>
          <span className={`${s.totalsAmt} num`}>{yen(recoverable)}</span>
        </div>

        <div className={s.footer}>
          <p>{report.advisory}</p>
          <p>
            引用している判例・ガイドラインの多くは二次資料での確認にとどまり、一次資料（民集・官報・裁判所公式サイト等）での確認は完了していません。
            本書面の内容を貸主・管理会社に提示する前に、ご自身でも一次資料をご確認いただくか、専門家（行政書士・弁護士等）にご相談ください。
          </p>
          <p>本診断は暫定的な参考情報であり、法的助言ではありません。</p>
        </div>
      </div>
    </main>
  );
}
