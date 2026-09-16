import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import "../../_design/tokens.css";
import s from "../../_screens/screens.module.css";
import { LegalNav, LegalPageNotice, NeedsInput } from "../_shared";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

const ROW: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "1.5rem", padding: ".75rem 0", borderBottom: "1px solid var(--rule)" };
const LABEL: CSSProperties = { flex: "0 0 9rem", color: "var(--ink-muted)", fontSize: ".875rem" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={ROW}>
      <div style={LABEL}>{label}</div>
      <div className={s.body} style={{ margin: 0, flex: 1 }}>{children}</div>
    </div>
  );
}

export default function TokushohoPage() {
  return (
    <main className="doc">
      <div className={s.wrap}>
        <LegalNav current="tokushoho" />
        <h1 className={s.h1}>特定商取引法に基づく表記</h1>
        <LegalPageNotice />

        <Row label="販売業者">獨歩文化株式会社</Row>
        <Row label="運営統括責任者"><NeedsInput>運営統括責任者の氏名</NeedsInput></Row>
        <Row label="所在地"><NeedsInput>本店所在地</NeedsInput></Row>
        <Row label="電話番号"><NeedsInput>電話番号</NeedsInput>（受付時間：<NeedsInput>受付時間</NeedsInput>）</Row>
        <Row label="メールアドレス"><NeedsInput>問い合わせ用メールアドレス</NeedsInput></Row>
        <Row label="販売価格">
          各診断ページに税込価格を表示しています（例：退去費用チェック　¥3,980（税込））。
        </Row>
        <Row label="商品代金以外に必要な料金">
          ありません。ただし、インターネット接続料金・通信料金はお客様のご負担となります。
        </Row>
        <Row label="お支払い方法">
          Shopifyの提供する決済手段（クレジットカード、PayPay、コンビニ払い等）による前払いです。
        </Row>
        <Row label="お支払い時期">お申し込み手続き完了時。</Row>
        <Row label="商品の引渡し時期">
          お支払い完了の確認後、通常数分程度で、診断結果ページへのリンクを記載したメールをお送りします
          （決済確認の状況により、確認までにお時間をいただく場合があります）。
        </Row>
        <Row label="返品・キャンセルについて">
          本サービスはデジタルコンテンツ（診断結果の閲覧）であり、性質上、お支払い完了後のお客様のご都合による
          キャンセル・返金はお受けしておりません。システムの不具合等により診断結果が正常に提供されなかった場合は、
          内容を確認のうえ返金いたします。<NeedsInput>この返品・キャンセル方針は、事業者の実際の方針として確定させてください</NeedsInput>。
        </Row>
        <Row label="動作環境">
          最新版のモダンブラウザ（Google Chrome、Safari、Microsoft Edge、Firefox 等）でのご利用を推奨します。
        </Row>
      </div>
    </main>
  );
}
