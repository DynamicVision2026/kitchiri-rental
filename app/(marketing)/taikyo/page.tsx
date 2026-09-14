import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "原状回復費用の診断 — 退去時の請求が妥当か、条項ごとに確認できます",
  description:
    "賃貸借契約書をアップロードすると、原状回復に関する特約を条項ごとに判定します。民法621条と国土交通省ガイドラインに基づき、通常損耗・経年変化の負担区分を確認できます。",
};

const FEATURES = [
  {
    title: "契約書ごと読み込む",
    body: "PDFをアップロードするか本文を貼り付けると、第◯条や特約事項の見出しを手がかりに条項へ分割し、まとめて判定します。",
  },
  {
    title: "4つの観点で判定",
    body: "明確性・所在・相当性・民法621条の4要件で評価します。判断できない点は推測せず、必要な情報をその場でお尋ねします。",
  },
  {
    title: "交渉文面まで作成",
    body: "争う余地のある条項については、条文と根拠を示した「確認・再検討のお願い」の文面を作成できます。",
  },
];

/** Marketing & SEO landing page for move-out restoration audits. Route: /taikyo */
export default function TaikyoLandingPage() {
  return (
    <main className={styles.root}>
      <h1 className={styles.h1}>退去時の原状回復費用、その請求は妥当ですか。</h1>
      <p className={styles.lede}>
        民法621条は、通常の使用による損耗と経年変化を賃借人の原状回復義務から除外しています。
        それでも契約書の特約によって、本来は貸主が負担すべき費用が借主に請求されることがあります。
        契約書を読み込むだけで、条項ごとにその負担区分を確認できます。
      </p>

      <Link className={styles.cta} href="/taikyo/workspace">契約書を診断する（無料）</Link>
      <p className={styles.ctaNote}>アップロードした契約書は判定のためにのみ使用します。</p>

      <h2 className={styles.h2}>できること</h2>
      <div className={styles.grid}>
        {FEATURES.map((f) => (
          <section key={f.title} className={styles.item}>
            <h3 className={styles.itemTitle}>{f.title}</h3>
            <p className={styles.itemBody}>{f.body}</p>
          </section>
        ))}
      </div>

      <h2 className={styles.h2}>判定の根拠</h2>
      <p className={styles.prose}>
        判定は、民法621条、国土交通省「原状回復をめぐるトラブルとガイドライン（再改訂版）」、および
        通常損耗補修特約の有効要件を示した最高裁平成17年12月16日判決の枠組みに沿って行います。
        特約が有効に成立しているか、金額が相当な範囲にあるかを、条項ごとに分けて評価します。
      </p>

      <p className={styles.notice}>
        本サービスは法的助言ではありません。判定結果は暫定的なものであり、引用している判例・ガイドラインは
        一次資料での確認が未了です。実際のご対応にあたっては、内容をご自身でご確認のうえ、
        必要に応じて弁護士等の専門家にご相談ください。
      </p>
    </main>
  );
}
