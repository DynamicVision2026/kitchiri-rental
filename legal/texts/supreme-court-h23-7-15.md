---
id: supreme-court-h23-7-15
type: supreme_court
citation_group_key: 最高裁 平成23年7月15日
title_ja: 最高裁判所第二小法廷判決 平成23年7月15日
title_en: Supreme Court (2nd Petty Bench), 15 July 2011
content_kind: holding_paraphrase
verification_status: secondary_source_checked
verified: false
---

## Holding, as this engine states it (paraphrase — not a verbatim quotation)

Upheld a lease-renewal fee (更新料) clause as valid absent 特段の事情
(special circumstances) such as the fee being 高額に過ぎる judged against
the rent, the fee's size, and the renewal interval. The judgment set no
numeric limit — only the 高額に過ぎる standard — and disposed of several
consolidated appeals with different facts.

## Contested figure this file does not settle

`lib/modules/taikyo/bands.ts` flags this explicitly:
`KOSHINRYO_BAND.supportedMax = 2.0` (months of rent per renewal year) is
safe under every secondary reading of the consolidated facts.
`elevatedMax = 2.7` is NOT: one secondary summary reports rent ¥38,000
against a two-month fee on a one-year cycle (2.0), another a ¥100,000 fee
against that same rent (≈2.63). This is BLOCKING per
`scripts/lib/citation-groups.ts` → `OPEN_QUESTIONS`: a human needs to
pull 民集65巻5号2269頁 and fix which facts the court actually upheld
before `elevatedMax` can be trusted, and the corpus entry that depends on
it (TK-0012) is flagged accordingly.

**Not verified against 民集 or courts.go.jp this session** — egress
blocked; no verbatim judgment text bundled.

## Where this is used in the engine

- `KOSHINRYO_BAND` (`lib/modules/taikyo/bands.ts`)
- `TOKUYAKU_PATTERNS.TK_KOSHIN`
