import type { Metadata } from "next";
import "../../_design/tokens.css";
import s from "../../_screens/screens.module.css";
import { getAuditStore, isAuditAccessible } from "@/lib/server/audit-store.ts";
import PaidReportView from "./PaidReportView";
import type { BatchReportResponse } from "@/lib/shared/taikyo-client.ts";

export const metadata: Metadata = { title: "診断結果" };
export const runtime = "nodejs";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="doc">
      <div className={s.tight}>
        <h1 className={s.h1}>{title}</h1>
        <p className={s.muted}>{body}</p>
      </div>
    </main>
  );
}

/**
 * Route: /taikyo/r/:id — the link the orders/paid webhook emails.
 *
 * "The unguessable ID IS the credential" (V15 scope note 2): possessing this URL is
 * the entire access model. There is no login, no session, nothing else to check.
 */
export default async function PaidReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getAuditStore().get(id);

  if (!record) {
    return <Message title="ページが見つかりません" body="このリンクは無効です。メールに記載されたリンクをご確認ください。" />;
  }
  if (record.revokedAt) {
    return <Message title="この診断結果はご利用いただけません" body="この購入は返金処理済みのため、診断結果をご覧いただけません。" />;
  }
  if (!isAuditAccessible(record)) {
    if (record.paidAt) {
      return <Message title="保存期間が終了しました" body="この診断結果は発行から90日を過ぎたため削除されました。お手数ですが、あらためて診断をお試しください。" />;
    }
    return (
      <Message
        title="お支払いの確認中です"
        body="お支払いの確認には数分かかることがあります。しばらくしてからこのページを再度お開きください。反映されない場合はお手数ですがお問い合わせください。"
      />
    );
  }

  return <PaidReportView auditId={record.id} report={record.report as BatchReportResponse} expiresAt={record.expiresAt} />;
}
