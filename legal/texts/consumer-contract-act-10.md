---
id: consumer-contract-act-10
type: statute
citation_group_key: 消費者契約法10条
title_ja: 消費者契約法第10条（消費者の利益を一方的に害する条項の無効）
title_en: Consumer Contract Act art. 10 (clauses one-sidedly harming the consumer)
issuer: 日本国（法律）
content_kind: statutory_text
verification_status: secondary_source_checked
verified: false
---

## 条文（recollection, not transcribed from e-Gov this session）

> 消費者の不作為をもって当該消費者が新たな消費者契約の申込み又はその承諾の意思表
> 示をしたものとみなす条項その他の法令中の公の秩序に関しない規定の適用による場合
> に比して消費者の権利を制限し又は消費者の義務を加重する消費者契約の条項であっ
> て、民法第一条第二項に規定する基本原則に反して消費者の利益を一方的に害するもの
> は、無効とする。

（消費者契約法第10条）

## Plain-language shape

A two-part test: (1) the clause departs from what a default (非公序)
rule of law would otherwise give the consumer, in a way that limits their
rights or expands their duties, AND (2) doing so one-sidedly harms the
consumer against the good-faith principle. Both this engine's `P3
相当性` prong and `SHIKIBIKI_BAND` / `KOSHINRYO_BAND` in
`lib/modules/taikyo/bands.ts` operate downstream of this article: it is
the statutory hook that lets a court cut back an amount that is
高額に過ぎる even where the clause itself is validly formed under the
最判平成17年12月16日 three-limb test.

**Not verified against e-Gov this session.** Quoted from confident
recollection; `verification_status` is `secondary_source_checked` (not
`primary_source_verified`) because no human confirmed the exact text
against the official source this session, and egress to e-Gov is
blocked in this environment.

## Where this is used in the engine

- `PRONGS.P3` authority list.
- `TOKUYAKU_PATTERNS.TK_SHIKIBIKI`, `TK_SHOUKYAKU`, `TK_KOSHIN`,
  `TK_TAIKYO_FEE`, `TK_SHOUDOKU`, `TK_TANKI` (`lib/modules/taikyo/taxonomy.ts`)
- `lib/phrases/ja.yaml` used by S3Result's per-line reasoning for
  `conditional`-tier findings (室内消毒施工費 in `lib/fixtures/taikyo-demo.ts`).
