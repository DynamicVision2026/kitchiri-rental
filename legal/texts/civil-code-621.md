---
id: civil-code-621
type: statute
citation_group_key: 民法621条
title_ja: 民法第621条（賃借人の原状回復義務）
title_en: Civil Code art. 621 (tenant's restoration obligation)
issuer: 日本国（法律）
in_force_from: "2020-04-01"
content_kind: statutory_text
verification_status: unverified
verified: false
---

## 条文（recollection, not transcribed from e-Gov this session）

> 賃借人は、賃借物を受け取った後にこれに生じた損傷（通常の使用及び収益によって生
> じた賃借物の損耗並びに賃借物の経年変化を除く。次条において同じ。）がある場合に
> おいて、賃貸借が終了したときは、その損傷を原状に復する義務を負う。ただし、その
> 損傷が賃借人の責めに帰することができない事由によるものであるときは、この限りで
> ない。

（民法第621条）

## Why this is quoted and the judgments below are not

This provision is short, famous, and — in this engine's experience of the
corpus — the single most load-bearing sentence in the whole product: every
P4 determination turns on the 通常の使用及び収益によって生じた賃借物の
損耗並びに賃借物の経年変化を除く parenthetical. A paraphrase risks
softening or shifting that exact carve-out. So it is quoted directly
rather than summarized, on the judgment that quoting from confident
recollection and flagging it `unverified` is safer than either omitting
it or silently paraphrasing something this exact.

**This has NOT been checked against the official text at
https://elaws.e-gov.go.jp this session** — egress to e-Gov is blocked in
this environment. `verification_status` reflects that honestly. Before
this file is relied on for anything client-facing beyond what the engine
already ships (which already discloses it is unverified — see
`lib/phrases/ja.yaml` → `cite.civil_621`), a human must confirm the exact
wording against e-Gov and re-run `audit:verify` with `--status primary`.

## Where this is used in the engine

- `PRONGS.P4` (`lib/modules/taikyo/taxonomy.ts`) — the override test.
- Every `depreciationSensitive: true` Tokuyaku pattern.
- `lib/phrases/ja.yaml` → `cite.civil_621` (the phrase shown to tenants).
- `CITATION_REGISTRY` in `lib/modules/taikyo/letter.ts` (outbound letters,
  gated at `secondary_source_checked`).
