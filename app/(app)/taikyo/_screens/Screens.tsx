/**
 * The taikyo funnel, S1–S6, as presentational components driven entirely by props.
 *
 * Nothing here fetches, stores or pays. Every screen is mounted against fixtures in
 * /taikyo/preview, including the paid and post-payment states, so when persistence
 * and KOMOJU land the change is a swap of the data source, not a rebuild of the view.
 *
 * Verdict tiers carry colour + glyph + word, and the accent is reserved for the
 * contestable tier and the primary action alone — so encountering it anywhere in the
 * product means "this is contestable". Everything else is ink on paper.
 */

import type { DemoLine, DemoTier } from "@/lib/fixtures/taikyo-demo.ts";
import s from "./screens.module.css";

export const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const TIER: Record<DemoTier, { label: string; glyph: string; tagClass: string; accent: boolean }> = {
  contestable: { label: "争える", glyph: "●", tagClass: s.tagAccent, accent: true },
  conditional: { label: "条件付き", glyph: "◐", tagClass: s.tagInk, accent: false },
  demand: { label: "立証を求める", glyph: "◇", tagClass: s.tagInk, accent: false },
  sound: { label: "妥当", glyph: "○", tagClass: s.tagMuted, accent: false },
};

export function TierTag({ tier }: { tier: DemoTier }) {
  const t = TIER[tier];
  return (
    <span className={`${s.verdictTag} ${t.tagClass}`}>
      <span aria-hidden="true">{t.glyph}</span>{t.label}
    </span>
  );
}

/* ── S1 ingest ─────────────────────────────────────────────────────────── */

export function S1Ingest({ refused = false }: { refused?: boolean }) {
  return (
    <div className={s.tight}>
      <ol className={s.steps}>
        <li className={s.stepOn}>契約書と精算書を入力する</li>
        <li>読み取り結果を確認する</li>
        <li>判定結果を見る</li>
      </ol>

      <h1 className={s.h1}>契約書と精算書を入力してください</h1>
      <p className={s.muted}>
        原状回復に関する条項と、請求されている金額がわかる部分を入力します。両方でなくても判定できます。
      </p>

      <div className={`${s.drop} ${s.noPrint}`} role="button" tabIndex={0} aria-label="PDFを選択">
        <div><strong>PDFを選ぶ</strong></div>
        <p className={s.tiny} style={{ margin: ".35rem 0 0" }}>文字情報を含むPDF（最大12MB）</p>
      </div>

      {refused && (
        <div className={s.deadEnd}>
          <p className={s.h3}>このPDFからは文字を読み取れませんでした</p>
          <p className={s.muted} style={{ margin: "0 0 .75rem" }}>
            スキャンした画像だけのPDFのようです。画像から文字を起こす機能は、金額の桁や「賃貸人／賃借人」を
            読み違えると判定が逆になるため、この診断では使っていません。
          </p>
          <p className={s.muted} style={{ margin: "0 0 .75rem" }}>
            お手数ですが、契約書の原状回復に関する条項を下の欄に入力してください。1条ずつでも構いません。
          </p>
          <button className={s.btnQuiet} type="button">入力欄に移動する</button>
        </div>
      )}

      <div className={s.or}>または本文を入力</div>

      <label className={s.h3} htmlFor="paste">契約書の条項・精算書の内訳</label>
      <textarea id="paste" className={s.field} defaultValue={""}
        placeholder={"第9条（原状回復）\n　賃借人は…\n\n特約事項\n　1. 退去時のハウスクリーニング費用として…"} />
      <p className={s.tiny}>入力した内容は判定のためにのみ使用します。</p>

      <div className={s.actions}><button className={s.btn} type="button">読み取る</button></div>
    </div>
  );
}

/* ── S2 confirm — the liability firewall ───────────────────────────────── */

export function S2Confirm({ lines }: { lines: DemoLine[] }) {
  return (
    <div className={s.tight}>
      <ol className={s.steps}>
        <li>契約書と精算書を入力する</li>
        <li className={s.stepOn}>読み取り結果を確認する</li>
        <li>判定結果を見る</li>
      </ol>

      <h1 className={s.h1}>読み取った内容をお手元の書類と照らし合わせてください</h1>
      <p className={s.muted}>
        判定はここで確認された内容だけを使います。読み取りが違っていると判定も変わりますので、
        1項目ずつご確認ください。
      </p>

      {lines.map((l) => (
        <div key={l.id} className={`${s.clauseCheck} ${l.confidence === "low" ? s.lowConf : ""}`}>
          {l.confidence === "low" && (
            <p className={s.lowConfNote}>読み取りの確実性が低い項目です。特にご確認ください。</p>
          )}
          <p className={s.clauseLabel}>{l.label}　<span className={s.num}>{yen(l.chargedJpy)}</span></p>
          <p className={s.clauseText}>{l.clause}</p>
          <div className={s.checkRow}>
            <label className={`${s.check} ${s.checkOn}`}>
              <input type="radio" name={`c-${l.id}`} defaultChecked /> 書類と一致している
            </label>
            <label className={s.check}>
              <input type="radio" name={`c-${l.id}`} /> 違っている / 直す
            </label>
          </div>
        </div>
      ))}

      <div className={s.actions}><button className={s.btn} type="button">この内容で判定する</button></div>
    </div>
  );
}

/* ── S3 free result ────────────────────────────────────────────────────── */

function TierBar({ tier, amount, total }: { tier: DemoTier; amount: number; total: number }) {
  const t = TIER[tier];
  const pct = total > 0 ? Math.max(2, Math.round((amount / total) * 100)) : 0;
  return (
    <div className={s.tierRow}>
      <span className={s.tierName}><span aria-hidden="true">{t.glyph}</span>{t.label}</span>
      <span className={s.bar}><span className={`${s.barFill} ${t.accent ? s.barAccent : ""}`}
        style={{ width: `${pct}%`, display: "block" }} /></span>
      <span className={`${s.tierAmt} ${s.num}`}>{yen(amount)}</span>
    </div>
  );
}

export function S3Result({
  lines, total, recoverable, sums, masked = true,
}: {
  lines: DemoLine[]; total: number; recoverable: number;
  sums: Record<DemoTier, number>; masked?: boolean;
}) {
  const allSound = recoverable === 0;

  return (
    <div className={s.tight}>
      {allSound ? (
        <div className={s.figureBlock}>
          <h1 className={s.h1}>この請求は概ね妥当です</h1>
          <p className={s.body}>
            入力いただいた <span className={s.num}>{yen(total)}</span> のうち、
            ガイドラインや判例に照らして争える項目は見つかりませんでした。
          </p>
          <p className={s.muted}>
            判定の理由は下にすべて記載しています。課金画面は表示されません。
          </p>
        </div>
      ) : (
        <div className={s.figureBlock}>
          <p className={s.figureLead}>
            ご請求 <span className={s.num}>{yen(total)}</span> のうち
          </p>
          <p className={`${s.figure} ${s.num} ${s.reveal}`} aria-live="polite">{yen(recoverable)}</p>
          <p className={s.figureTail}>が貸主負担となる可能性があります</p>
          {sums.demand > 0 && (
            <p className={s.tiny} style={{ marginTop: ".75rem" }}>
              このほか <span className={s.num}>{yen(sums.demand)}</span> は、
              判断に必要な資料が示されていないため上の金額に含めていません。
            </p>
          )}
        </div>
      )}

      <hr className={s.sectionRule} />

      <div role="img" aria-label={(Object.keys(sums) as DemoTier[])
        .filter((t) => sums[t] > 0).map((t) => `${TIER[t].label} ${yen(sums[t])}`).join("、")}>
        {(Object.keys(sums) as DemoTier[]).filter((t) => sums[t] > 0).map((t) => (
          <TierBar key={t} tier={t} amount={sums[t]} total={total} />
        ))}
      </div>

      <h2 className={s.h2}>項目ごとの内訳</h2>
      {lines.map((l) => (
        <div key={l.id} className={s.lineRow} style={{ display: "block" }}>
          <div className={s.itemHead}>
            <TierTag tier={l.tier} />
            <span className={`${s.itemAmt} ${s.num} ${masked ? s.masked : ""}`}>{yen(l.chargedJpy)}</span>
          </div>
          <p className={s.itemName}>{l.label}</p>
          {!masked && <p className={s.muted} style={{ margin: ".35rem 0 .75rem" }}>{l.reasoning}</p>}
        </div>
      ))}

      {masked && (
        <>
          <p className={s.maskNote}>
            項目ごとの金額と判定の理由は、お申し込み後に表示されます。
          </p>
          <div className={s.actions}>
            <button className={s.btn} type="button">全項目の内訳と文面を見る</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── S4 unlock ─────────────────────────────────────────────────────────── */

export function S4Unlock({
  skus, deliverables, methods,
}: {
  skus: { id: string; name: string; priceJpy: number; primary: boolean; note: string }[];
  deliverables: string[]; methods: string[];
}) {
  const main = skus.find((k) => k.primary)!;
  const others = skus.filter((k) => !k.primary);
  return (
    <div className={s.tight}>
      <h1 className={s.h1}>{main.name}</h1>
      <div className={s.priceRow}>
        <span className={`${s.price} ${s.num}`}>{yen(main.priceJpy)}</span>
        <span className={s.muted}>税込・1回かぎり</span>
      </div>
      <p className={s.muted}>{main.note}</p>

      <h2 className={s.h2}>お渡しするもの</h2>
      <ul className={s.deliverables}>{deliverables.map((d) => <li key={d}>{d}</li>)}</ul>

      <h2 className={s.h2}>お支払い方法</h2>
      <div className={s.methods}>{methods.map((m) => <span key={m} className={s.method}>{m}</span>)}</div>

      <div className={s.actions}><button className={s.btn} type="button">申し込む</button></div>
      <p className={s.tiny} style={{ marginTop: ".75rem" }}>
        争える項目がない場合、課金画面は表示されません。
      </p>

      <hr className={s.sectionRule} />
      <h2 className={s.h2} style={{ marginTop: 0 }}>ほかの診断</h2>
      {others.map((k) => (
        <div key={k.id} className={s.skuQuiet}>
          <p className={s.h3} style={{ margin: 0 }}>
            {k.name}　<span className={s.num}>{yen(k.priceJpy)}</span>
          </p>
          <p className={s.tiny} style={{ margin: ".25rem 0 0" }}>{k.note}</p>
        </div>
      ))}

      <p className={s.tiny} style={{ marginTop: "1.5rem" }}>
        サンプルレポート（PDF）を全文ご覧いただけます。
      </p>
    </div>
  );
}

/* ── S5 paid report ────────────────────────────────────────────────────── */

const CITE_LABEL = { primary: "一次資料で確認済", secondary: "二次資料で照合", unverified: "未確認" } as const;

export function S5Report({ lines, total, recoverable }: { lines: DemoLine[]; total: number; recoverable: number }) {
  return (
    <div className={s.tight}>
      <h1 className={s.h1}>診断結果</h1>
      <p className={s.body}>
        ご請求 <span className={s.num}>{yen(total)}</span> のうち、
        <strong className={s.num}>{yen(recoverable)}</strong> が貸主負担となる可能性があります。
      </p>
      <hr className={s.sectionRule} />

      {lines.map((l) => (
        <section key={l.id} style={{ marginBottom: "2rem" }}>
          <div className={s.itemHead}>
            <TierTag tier={l.tier} />
            <span className={`${s.itemAmt} ${s.num}`}>{yen(l.chargedJpy)}</span>
          </div>
          <p className={s.itemName} style={{ fontWeight: 700 }}>{l.label}</p>
          <p className={s.muted} style={{ margin: ".35rem 0 .5rem" }}>{l.reasoning}</p>
          <p className={s.cite}>
            根拠：{l.citation.text}
            <span className={`${s.citeTier} ${l.citation.tier === "unverified" ? s.citeUnverified : ""}`}>
              {CITE_LABEL[l.citation.tier]}
            </span>
          </p>
          <hr className={s.hair} />
        </section>
      ))}

      <p className={s.tiny}>
        「二次資料で照合」は、解説記事等で内容を確認した段階で、判例集等の一次資料には未確認です。
        文面に引用する際はご自身でもご確認ください。
      </p>
    </div>
  );
}

/* ── S6 letter ─────────────────────────────────────────────────────────── */

export function S6Letter({ lines, letterText }: { lines: DemoLine[]; letterText: string }) {
  const groups = [
    { key: "contestable" as DemoTier, head: "争う", weight: "", note: "負担区分について見解が異なる項目" },
    { key: "conditional" as DemoTier, head: "条件付きで争う", weight: s.stanceWeight2, note: "金額の相当性を確認する項目" },
    { key: "demand" as DemoTier, head: "立証を求める", weight: s.stanceWeight3, note: "判断材料の提示を求める項目" },
  ];
  return (
    <div className={s.tight}>
      <h1 className={s.h1}>貸主・管理会社あての文面</h1>
      <p className={s.muted}>
        入れる項目を選べます。外した項目は文面に含まれません。
      </p>

      {groups.map((g) => {
        const rows = lines.filter((l) => l.tier === g.key);
        if (rows.length === 0) return null;
        return (
          <div key={g.key} className={s.stance}>
            <div className={`${s.stanceHead} ${g.weight}`}>
              <strong>{g.head}</strong><span className={s.tiny}>{g.note}</span>
            </div>
            {rows.map((l) => (
              <label key={l.id} className={s.lineRow} style={{ cursor: "pointer", alignItems: "start" }}>
                <span style={{ display: "flex", gap: ".5rem" }}>
                  <input type="checkbox" defaultChecked style={{ marginTop: ".4rem", flex: "none" }} />
                  <span>{l.label}</span>
                </span>
                <span className={`${s.num} ${s.itemAmt}`}>{yen(l.chargedJpy)}</span>
              </label>
            ))}
          </div>
        );
      })}

      <div className={s.actions}><button className={s.btn} type="button">この内容で文面を作る</button></div>

      <h2 className={s.h2}>文面のプレビュー</h2>
      <div className={s.sheet}>{letterText}</div>
      <div className={s.checkRow} style={{ marginTop: "1rem" }}>
        <button className={s.btnQuiet} type="button">コピー</button>
        <button className={s.btnQuiet} type="button">テキストで保存</button>
        <button className={s.btnQuiet} type="button">PDFで保存</button>
      </div>
    </div>
  );
}
