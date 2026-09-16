---
id: consumer-contract-act-9
type: statute
citation_group_key: 消費者契約法9条
title_ja: 消費者契約法第9条（消費者が支払う損害賠償の額を予定する条項等の無効）
title_en: Consumer Contract Act art. 9 (liquidated-damages / penalty clauses)
issuer: 日本国（法律）
content_kind: holding_paraphrase
verification_status: secondary_source_checked
verified: false
---

## Summary (paraphrase — not a verbatim quotation of the article)

Article 9 addresses two things relevant to this product's TK_TANKI
(短期解約違約金) pattern:

1. A clause fixing the tenant's liability for cancellation or breach is
   void **to the extent** it exceeds the average amount of loss the
   business would actually be expected to suffer from that kind of
   cancellation, in that kind of contract, under the circumstances.
2. A clause imposing a late-payment penalty is void to the extent its
   rate exceeds an annual rate of 14.6% on the overdue amount.

This is a partial-invalidity rule, not a full-invalidity rule: the
clause survives, and only the excess above the average-loss figure is
struck — which is exactly the same shape as this engine's `reducible`
verdict, and is the statutory anchor `TANKI_KAIYAKU_BAND` in
`lib/modules/taikyo/bands.ts` is reaching for even though that band's own
numbers are currently a `market_survey` placeholder, not sourced from a
decided 平均的な損害額 figure.

**Not verified against the primary statutory text this session** — egress
to e-Gov is blocked. The exact wording, especially the 14.6% figure and
any amendments to it, must be confirmed against
https://elaws.e-gov.go.jp before this file's content_kind could honestly
move to `statutory_text`.

## Where this is used in the engine

- `TOKUYAKU_PATTERNS.TK_TANKI.authority` (`lib/modules/taikyo/taxonomy.ts`)
- `TANKI_KAIYAKU_BAND` (`lib/modules/taikyo/bands.ts`) — band numbers are
  a market-survey placeholder pending a sourced 平均的な損害額 figure.
