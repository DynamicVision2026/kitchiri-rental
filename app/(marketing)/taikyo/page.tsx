import type { Metadata } from "next";
import Link from "next/link";
import "../../(app)/taikyo/_design/tokens.css";
import s from "../../(app)/taikyo/_screens/screens.module.css";

export const metadata: Metadata = {
  title: "退去費用の診断 — その請求、本当に払う必要がありますか",
  description:
    "退去時の原状回復費用について、契約書と精算書の内容から、貸主負担の可能性がある項目を判定します。民法621条と国土交通省ガイドラインに基づきます。",
};

/** S0 — landing. The problem in the tenant's words, then the action. No hero image. */
export default function TaikyoLandingPage() {
  return (
    <main className="doc">
      <div className={s.wrap}>
        <h1 className={s.h1} style={{ fontSize: "1.75rem", lineHeight: 1.5 }}>
          その退去費用、本当に払う<br />必要がありますか。
        </h1>

        <p className={s.lede}>
          精算書と契約書の内容を入力するだけ。国土交通省のガイドラインと民法621条に照らして、
          貸主負担の可能性がある項目を判定します。
        </p>

        <Link className={s.btn} href="/taikyo/workspace">無料で診断する</Link>
        <p className={s.tiny} style={{ marginTop: ".75rem" }}>
          妥当な請求なら、そう伝えます。入力した内容は判定のためにのみ使用します。
        </p>

        <p className={s.notice}>
          判定に用いる法令・判例のうち、一次資料（判例集・官公庁の原本）で確認できていないものがあります。
          文面に引用する際は、内容をご自身でもご確認ください。
        </p>

        <ul className={s.linkList}>
          <li><Link href="/taikyo/kijun">何を根拠に判定しているか<span aria-hidden="true">→</span></Link></li>
          <li><Link href="/taikyo/sample">サンプルレポートを見る<span aria-hidden="true">→</span></Link></li>
        </ul>

        <p className={s.tiny} style={{ marginTop: "2rem" }}>
          獨歩文化株式会社　/　<Link href="/taikyo/legal/tokushoho">特定商取引法に基づく表記</Link>
          　/　<Link href="/taikyo/legal/terms">利用規約</Link>
          　/　<Link href="/taikyo/legal/privacy">プライバシーポリシー</Link>
        </p>
      </div>
    </main>
  );
}
