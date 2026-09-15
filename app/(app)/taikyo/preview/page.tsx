import type { Metadata } from "next";
import "../_design/tokens.css";
import s from "../_screens/screens.module.css";
import { S1Ingest, S2Confirm, S3Result, S4Unlock, S5Report, S6Letter } from "../_screens/Screens";
import {
  DELIVERABLES, DEMO_LINES, DEMO_RECOVERABLE, DEMO_SOUND_ONLY, DEMO_TOTAL,
  PAYMENT_METHODS, SKUS, demoSum, type DemoTier,
} from "@/lib/fixtures/taikyo-demo.ts";

export const metadata: Metadata = { title: "画面プレビュー（サンプル）" };

const SUMS: Record<DemoTier, number> = {
  contestable: demoSum("contestable"),
  conditional: demoSum("conditional"),
  demand: demoSum("demand"),
  sound: demoSum("sound"),
};

const SOUND_TOTAL = DEMO_SOUND_ONLY.reduce((n, l) => n + l.chargedJpy, 0);
const SOUND_SUMS: Record<DemoTier, number> = {
  contestable: 0, conditional: 0, demand: 0, sound: SOUND_TOTAL,
};

const SAMPLE_LETTER = `2026年9月15日

【貸主・管理会社名】　御中

　　　　【ご住所】
　　　　【お名前】

　　　　　　原状回復費用に関する確認および再検討のお願い

拝啓　時下ますますご清栄のこととお慶び申し上げます。

　さて、このたび下記物件の明渡しに伴い、原状回復費用としてご請求をいただきました。
つきましては、その負担区分について確認させていただきたく、本書面を差し上げます。

記

1. 負担区分について見解の相違がある項目

　　(1) クロス張替え（居室全面）　ご請求額 62,000円
　　　　当該条項は、通常損耗・経年変化に相当する部分まで賃借人の負担とする内容と
　　　　解されます。民法621条は、通常の使用及び収益によって生じた損耗並びに経年
　　　　変化を賃借人の原状回復義務の対象から除外しております。

2. 金額の相当性について確認をお願いする項目

　　(1) 室内消毒施工費　ご請求額 25,000円

3. お願いする事項

　　(1) 入居時の物件状況確認書及び施工内訳書をご提示ください。
　　(2) 上記を踏まえ、ご請求額の再検討をお願いしたく存じます。

　　　　　　　　　　　　　　　　　　　　敬具`;

/** Every funnel state against fixtures, so V13's wiring is a swap, not a rebuild. */
export default function PreviewPage() {
  const Divider = ({ id, title, note }: { id: string; title: string; note: string }) => (
    <div className={s.tight} style={{ paddingBottom: 0 }}>
      <hr className={s.sectionRule} />
      <p className={s.tiny} style={{ margin: 0 }}>{id}</p>
      <h2 className={s.h2} style={{ margin: ".15rem 0 .25rem" }}>{title}</h2>
      <p className={s.tiny} style={{ margin: "0 0 .5rem" }}>{note}</p>
    </div>
  );

  return (
    <main className="doc">
      <div className={s.tight} style={{ paddingBottom: 0 }}>
        <h1 className={s.h1}>画面プレビュー</h1>
        <p className={s.muted}>
          すべてサンプルデータです。実際の判定結果ではありません。
        </p>
      </div>

      <Divider id="S1" title="入力" note="貼り付けとPDF、同じ重みで並べています。" />
      <S1Ingest />

      <Divider id="S1b" title="入力 — スキャンPDFを断る場合" note="行き止まりにせず、次の一手を示します。" />
      <S1Ingest refused />

      <Divider id="S2" title="読み取り確認" note="紙と照合する画面。折りたたまない。" />
      <S2Confirm lines={DEMO_LINES} />

      <Divider id="S3" title="無料の判定結果" note="金額と理由は伏せ、見出しの数字だけを大きく。" />
      <S3Result lines={DEMO_LINES} total={DEMO_TOTAL} recoverable={DEMO_RECOVERABLE} sums={SUMS} masked />

      <Divider id="S3b" title="無料の判定結果 — 争える項目がない場合" note="課金画面を出さず、理由まで全て表示します。" />
      <S3Result lines={DEMO_SOUND_ONLY} total={SOUND_TOTAL} recoverable={0} sums={SOUND_SUMS} masked={false} />

      <Divider id="S4" title="お申し込み" note="煽らない。パックは静かに置く。" />
      <S4Unlock skus={SKUS} deliverables={DELIVERABLES} methods={PAYMENT_METHODS} />

      <Divider id="S5" title="判定結果（申し込み後）" note="根拠の検証状況を本文の一部として表示。" />
      <S5Report lines={DEMO_LINES} total={DEMO_TOTAL} recoverable={DEMO_RECOVERABLE} />

      <Divider id="S6" title="文面" note="三つの立場を三つの節に。プレビューは明朝。" />
      <S6Letter lines={DEMO_LINES} letterText={SAMPLE_LETTER} />
    </main>
  );
}
