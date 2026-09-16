---
id: mlit-guideline-2011
type: guideline
citation_group_key: 国土交通省 原状回復ガイドライン（再改訂版, 平成23年8月）
title_ja: 原状回復をめぐるトラブルとガイドライン（再改訂版）
title_en: "MLIT: Trouble and Guidelines Concerning Restoration to Original Condition (revised edition)"
issuer: 国土交通省住宅局
published: "2011-08"
content_kind: holding_paraphrase
verification_status: secondary_source_checked
verified: false
---

## Summary (paraphrase — administrative guidance, not binding law)

The MLIT guideline is persuasive administrative guidance, not a statute
or a judgment — courts and 消費者契約法10条 review are what actually
determine enforceability, but the guideline is widely cited in that
review and is the source this engine leans on hardest for two things:

1. **The 経過年数 (useful-life) depreciation tables.** Certain fixtures
   (クロス, カーペット, 設備機器, 流し台, 便器・洗面台等) depreciate on a
   straight line to a residual value of ¥1 across a stated useful life;
   others (畳表, フローリングの部分補修) are treated as consumables or
   repairs with no such depreciation. This engine's
   `DEPRECIATION_YEARS` and `RESIDUAL_VALUE_JPY` in
   `lib/modules/taikyo/bands.ts` are transcribed from this understanding.
2. **The general allocation principle**: 通常の使用による損耗・経年変化
   is the landlord's cost (it is priced into rent); damage from the
   tenant's own negligence, deliberate act, or a use exceeding ordinary
   use is the tenant's. This is the same allocation art. 621 codifies,
   and the guideline is largely a worked-example elaboration of it —
   which is also why a clause conflicting with the guideline's damaged-
   portion unit of accounting (repairing only the damaged area, not an
   entire surface) is flagged by `TK_ZENMEN`.

**Not verified against the guideline PDF itself this session** — egress
to mlit.go.jp is blocked in this environment, and every numeric band
sourced from it in `bands.ts` that is not explicitly a `precedent_facts`
band is marked `market_survey` pending that confirmation. Treat the
depreciation years above as the guideline's stated framework, and treat
any JPY figure elsewhere in this product as NOT sourced from this
document unless its `basis` says `guideline`.

## Where this is used in the engine

- `DEPRECIATION_YEARS`, `RESIDUAL_VALUE_JPY`, `residualBurdenRatio()`
  (`lib/modules/taikyo/bands.ts`)
- `TOKUYAKU_PATTERNS.TK_CLEAN`, `TK_TATAMI`, `TK_CROSS`, `TK_FLOOR`,
  `TK_KAGI`, `TK_ZENMEN` (`lib/modules/taikyo/taxonomy.ts`)
- `lib/phrases/ja.yaml` → `cite.guideline`
