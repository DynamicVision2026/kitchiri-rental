---
id: supreme-court-h17-12-16
type: supreme_court
citation_group_key: 最高裁 平成17年12月16日
title_ja: 最高裁判所第二小法廷判決 平成17年12月16日
title_en: Supreme Court (2nd Petty Bench), 16 December 2005
content_kind: holding_paraphrase
verification_status: secondary_source_checked
verified: false
---

## Holding, as this engine states it (paraphrase — not a verbatim quotation)

A special clause (特約) shifting the cost of ordinary wear and aging
(通常損耗・経年変化) onto the tenant, which art. 621 would otherwise
leave with the landlord, is enforceable only where a three-part test is
met:

1. **明確性 (clarity)** — the clause identifies concretely WHICH
   restoration work the tenant bears and AT WHAT cost: a fixed sum, a
   unit price, or a determinate formula. An open-ended "restore to
   original condition at tenant's expense" clause does not put the
   tenant on notice of a specific burden.
2. **認識 (recognition)** — the tenant recognised that this went beyond
   the statutory default (i.e., understood they were taking on a burden
   art. 621 would not otherwise impose).
3. **合意 (assent)** — the tenant actually manifested assent to that
   burden, not merely signed a lease that happened to contain it
   somewhere.

This is the test `PRONGS.P1`, `P2`, and `P4` in
`lib/modules/taikyo/taxonomy.ts` decompose into three separately-scored
prongs, and it is the single most load-bearing precedent in this product:
an error here propagates to every depreciation-sensitive Tokuyaku
pattern.

## Open question this file does not settle

`scripts/lib/citation-groups.ts` → `OPEN_QUESTIONS` already tracks this:
the exact wording of all three limbs, and whether "recognition" and
"assent" are properly two separate limbs or one, has not been confirmed
against 民集 or a reliable secondary reporter this session. The
paraphrase above is this engine's own working statement of the rule, not
a transcription of the judgment's language.

**Not verified against 民集 or courts.go.jp 裁判例検索 this session** —
egress to both is blocked in this environment, and no verbatim judgment
text is bundled here or anywhere in this product.

## Where this is used in the engine

- `PRONGS.P1`, `P2`, `P4` authority lists (`lib/modules/taikyo/taxonomy.ts`)
- Every `depreciationSensitive: true` Tokuyaku pattern
- `lib/phrases/ja.yaml` → `cite.h17`
- `CITATION_REGISTRY` in `lib/modules/taikyo/letter.ts`
