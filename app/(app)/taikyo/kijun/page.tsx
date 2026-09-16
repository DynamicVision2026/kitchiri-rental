import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import "../_design/tokens.css";
import s from "../_screens/screens.module.css";
import { PRONGS } from "@/lib/modules/taikyo/taxonomy.ts";
import { VERDICT_MEANINGS, VERDICTS } from "@/lib/modules/taikyo/taxonomy.ts";

export const metadata: Metadata = {
  title: "何を根拠に判定しているか",
  description: "退去費用チェックが原状回復特約をどのような基準で判定しているかをご説明します。",
};
export const runtime = "nodejs";

const VERIFICATION_LABEL: Record<string, string> = {
  primary_source_verified: "一次資料で確認済",
  secondary_source_checked: "二次資料で照合",
  unverified: "未確認",
};

interface LegalManifestEntry {
  id: string;
  title_ja: string;
  type: string;
  verification_status: string;
}

function readLegalManifest(): LegalManifestEntry[] {
  try {
    const raw = readFileSync(join(process.cwd(), "legal", "manifest.json"), "utf8");
    return (JSON.parse(raw).entries ?? []) as LegalManifestEntry[];
  } catch {
    return [];
  }
}

const PRONG_ORDER = ["P1", "P2", "P3", "P4"] as const;

/** Plain-language restatement of each prong's question — PRONGS.question is written
 *  for reviewers, in English; this is the same test in the register a tenant reads. */
const PRONG_PLAIN_JA: Record<(typeof PRONG_ORDER)[number], string> = {
  P1: "何を、いくら（または算定方法）負担させるのかが、条項自体から具体的にわかること。",
  P2: "その条項が実際の賃貸借契約書（または別途取り交わした書面）に記載されており、賃借人がそれに同意していること。",
  P3: "請求されている金額が、経過年数による減価を踏まえてもなお、判例やガイドラインに照らして相当な範囲にとどまっていること。",
  P4: "以上を踏まえてもなお、民法621条が定める「通常損耗・経年変化は賃借人の負担としない」という原則を、この条項が有効に覆せていること。",
};

const VERDICT_ORDER: readonly (typeof VERDICTS)[number][] = ["unenforceable", "severable", "reducible", "needs_review", "enforceable"];

export default function KijunPage() {
  const legal = readLegalManifest();

  return (
    <main className="doc">
      <div className={s.wrap}>
        <h1 className={s.h1}>何を根拠に判定しているか</h1>
        <p className={s.lede}>
          この診断は、民法621条と国土交通省の原状回復ガイドライン、関連する最高裁判例を土台に、
          4つの観点（P1〜P4）から各条項を機械的に判定しています。人の目で個別に読むわけではないため、
          このページで判定の仕組みそのものをすべて開示します。
        </p>

        <p className={s.notice}>
          本診断は暫定的な参考情報であり、法的助言ではありません。引用している法令・ガイドラインの多くは
          二次資料での確認にとどまり、判例集や官公庁原本での一次資料確認が完了していないものがあります
          （下の「参照した法令・ガイドライン」に確認状況を記載しています）。
        </p>

        <h2 className={s.h2}>出発点：民法621条</h2>
        <p className={s.body}>
          民法621条は、賃借人は借りた部屋に生じた損傷を原状に復する義務を負う一方で、
          「通常の使用及び収益によって生じた賃借物の損耗並びに賃借物の経年変化」——
          つまり普通に住んでいれば生じる傷みや古さ——は、その義務から除くと定めています。
          この条文は任意規定のため、特約（契約書の中の個別の取り決め）によって、
          この原則を賃借人の不利な方向へ動かすこと自体はできます。ただし、そのためには一定の要件を
          満たす必要がある、というのが最高裁平成17年12月16日判決以来の考え方です。
        </p>

        <h2 className={s.h2}>4つの観点（P1〜P4）</h2>
        <p className={s.body}>
          この診断は、原状回復に関する特約条項を次の4つの観点で採点します。すべてを満たしていなければ、
          特約は民法621条の原則を覆せていない——つまりその費用は貸主負担のまま——と判定されます。
        </p>
        {PRONG_ORDER.map((id) => (
          <div key={id} className={s.skuQuiet} style={{ marginBottom: "1rem" }}>
            <p className={s.h3} style={{ margin: 0 }}>{id}　{PRONGS[id].labelJa}</p>
            <p className={s.muted} style={{ margin: ".35rem 0 0" }}>{PRONG_PLAIN_JA[id]}</p>
          </div>
        ))}
        <p className={s.tiny}>
          いずれかの観点を判断するための情報が契約書だけでは分からない場合、その観点は「満たさない」ではなく
          「不明」として扱われます。分からないことと、要件を満たしていないことを混同すると、
          実際には有効な特約まで無効と判定してしまうおそれがあるためです。
        </p>

        <h2 className={s.h2}>経過年数（減価）の考え方</h2>
        <p className={s.body}>
          クロスやカーペットなど、国土交通省のガイドラインが耐用年数を示している設備については、
          入居期間に応じて賃借人が負担すべき割合が直線的に下がり、耐用年数を過ぎればほぼ負担なし
          （残存価値1円）という考え方を採用しています。畳表やフローリングの部分補修など、
          ガイドラインが経過年数の対象としていない項目には、この減価を適用していません。
        </p>

        <h2 className={s.h2}>判定結果（5種類）</h2>
        <p className={s.body}>
          4つの観点の結果は、次の5種類のいずれかにまとめられます。「無効」と「一部無効（通常損耗部分）」を
          分けているのは、通常損耗を超える毀損については民法621条そのものにより賃借人が引き続き負担する
          義務を負うためで、この区別を保たないと、実際には一部負担すべき請求まで「支払わなくてよい」と
          誤解させてしまうおそれがあるからです。
        </p>
        {VERDICT_ORDER.map((v) => (
          <div key={v} className={s.skuQuiet} style={{ marginBottom: "1rem" }}>
            <p className={s.h3} style={{ margin: 0 }}>{VERDICT_MEANINGS[v].labelJa}</p>
            <p className={s.muted} style={{ margin: ".35rem 0 0" }}>{VERDICT_MEANINGS[v].tenantMessageJa}</p>
          </div>
        ))}

        <h2 className={s.h2}>この診断ができないこと</h2>
        <ul>
          <li className={s.body}>スキャン画像のみのPDFから文字を読み取ることはできません。金額や当事者を読み違えるリスクがあるためです。</li>
          <li className={s.body}>個別の事案についての法的助言はできません。最終的なご判断や貸主・管理会社との交渉は、必要に応じて行政書士・弁護士等の専門家にご相談ください。</li>
          <li className={s.body}>契約書に記載のない事実（実際の毀損の有無や程度など）は、契約書の記載だけからは判定できません。</li>
        </ul>

        {legal.length > 0 && (
          <>
            <h2 className={s.h2}>参照した法令・ガイドライン</h2>
            <p className={s.tiny} style={{ marginBottom: "1rem" }}>
              判定に用いている主要な法令・判例・ガイドラインの一覧と、現時点での確認状況です。
            </p>
            <ul className={s.linkList} style={{ listStyle: "none", padding: 0 }}>
              {legal.map((e) => (
                <li key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: ".5rem 0", borderBottom: "1px solid var(--rule)" }}>
                  <span>{e.title_ja}</span>
                  <span className={s.tiny}>{VERIFICATION_LABEL[e.verification_status] ?? e.verification_status}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className={s.tiny} style={{ marginTop: "2rem" }}>
          <Link href="/taikyo/workspace">契約書を診断する→</Link>
        </p>
      </div>
    </main>
  );
}
