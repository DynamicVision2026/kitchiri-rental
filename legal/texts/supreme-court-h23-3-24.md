---
id: supreme-court-h23-3-24
type: supreme_court
citation_group_key: 最高裁 平成23年3月24日
title_ja: 最高裁判所第一小法廷判決 平成23年3月24日
title_en: Supreme Court (1st Petty Bench), 24 March 2011
content_kind: holding_paraphrase
verification_status: secondary_source_checked
verified: false
---

## Holding, as this engine states it (paraphrase — not a verbatim quotation)

The FRAMEWORK case for 敷引 (shikibiki) clauses: a clause retaining a
fixed portion of the deposit regardless of actual damage is not void
under 消費者契約法10条 merely because it exists. It is void only where the
retained sum is 高額に過ぎる (excessive), judged against the ordinary-wear
repair cost that would otherwise be expected, the rent, and any other
lump-sum payments such as 礼金.

Secondary summaries report the case's own facts as approximately
¥96,000 monthly rent against a ¥210,000 retention (≈2.19× rent) — upheld.

## What this case is NOT the source of

This case is the FRAMEWORK, not the 2×–3.5× numeric range. An earlier
revision of `lib/modules/taikyo/bands.ts` incorrectly attributed BOTH the
2.19× fact pattern AND the 2×–3.5× range to this single date; the range
belongs to 最判平成23年7月12日 (a separate decision applying this
framework). See `supreme-court-h23-7-12.md` and the correction note in
`bands.ts` itself, dated 2026-09-14.

## Open question this file does not settle

`scripts/lib/citation-groups.ts` → `OPEN_QUESTIONS`: confirm the reported
2.19× facts against 民集, and confirm this decision does not itself
state the 2×–3.5× range (the point above should not be re-confused).

**Not verified against 民集 or courts.go.jp this session** — egress
blocked; no verbatim judgment text bundled.

## Where this is used in the engine

- `SHIKIBIKI_BAND.supportedMax` (`lib/modules/taikyo/bands.ts`)
- `TOKUYAKU_PATTERNS.TK_SHIKIBIKI`, `TK_SHOUKYAKU`
- `lib/phrases/ja.yaml` → `cite.shikibiki`
- `CITATION_REGISTRY` in `lib/modules/taikyo/letter.ts`
