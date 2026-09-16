Ticket V13 — Persistence, Identity, Paywall, and the Missing Safety Rails
Priority: Blocker for launch. No further engine work until this lands. Reference specs: `chintai-suite-master-spec.md`§1.5, §4.2; `addendum-a-tokuyaku-full-depth.md` §A4 Estimated shape: one week, seven tasks. Tasks 1–4 are the product; 5–6 are safety rails from Addendum A that were never built; 7 is a measurement change.
Context — why this ticket exists
V10–V12 built the engine, and the engine is good. But four work reports have produced no payment path, no persistence, and no identity. As it stands a user can paste a contract, receive a full report with per-clause verdicts, generate a negotiation letter and export it — for free, anonymously, with nothing stored. That is a complete analyzer and it is not a business.
More importantly, `tenancies` and `entitlements` were the entire mechanism of merging 入居 and 退去 into one product. Without them the two modules share a repo and nothing else: the ¥4,980 pack cannot be sold, the −90-day reminder cannot fire, and the 特約 extracted at move-in cannot be read at move-out two years later. The strategic reason for the merge currently has no implementation.
Do not treat this as plumbing. `audits.module` is where the two-module architecture either exists or doesn't.
Task 1 — Supabase schema, RLS, and the anonymous-first flow
Implement the schema exactly as specified in master spec §1.5: `users`, `audits`, `documents`, `tenancies`, `entitlements`, `payments`, `unknown_labels`.
Points that are easy to get wrong:

* `audits` is one table discriminated by `module text check (module in ('nyukyo','taikyo'))`. Not `taikyo_audits`. If a `nyukyo_*` table appears in this migration, the ticket has failed.
* Typing lives in Zod, not Postgres. `intake`, `extracted`, `extracted_confirmed`, `verdicts`, `headline` are `jsonb`. A rule-table change must never require a migration.
* `extracted_confirmed` is the only input to judging. Wire this as an invariant, not a convention: `runJudge` should refuse to run on an audit whose `extracted_confirmed` is null. Raw model output must never reach the rules engine.
* Anonymous first. An audit is created with `anon_key` (signed, httpOnly cookie) and no `user_id`. Email capture at the confirm step attaches it. No signup wall before the user sees value.
* RLS on every table, keyed to `auth.uid()` or the signed `anon_key`. Documents bucket private, signed URLs only, 90-day lifecycle rule.
* Stamp `rulebook_version` and `model_version` on every audit at judge time. When a rule changes we must be able to reconstruct what a given user was told and why.

Acceptance: an audit survives a page reload and a device change via magic link; a second user cannot read the first user's audit by id; documents are unreachable without a signed URL; a judge call on unconfirmed extraction throws.
Task 2 — Magic-link identity
`api/auth/magic`, Resend delivery, `/my` landing showing past audits and unredeemed entitlements. No passwords, ever.
Capture the email at the confirm step (S3), not at upload and not at the paywall. Rationale: by S3 the user has invested effort and can see the extraction worked, but has not yet seen the number — so the email is exchanged for "come back to this," not extracted as a toll before value.
Acceptance: close the tab at S4, open the emailed link on a phone, land on the same result with the same verdicts.
Task 3 — The free/paid boundary and KOMOJU
This is the revenue path. Follow master spec §4.1–4.2.
The free result (S4) shows: the headline number, the count of affected clauses, tier bars, and line labels. The free result masks: per-line amounts, all reasoning and citations, and every template and letter.
Affiliates were dropped, so the paid tier carries 100% of revenue. The generous free tier from earlier drafts existed to feed insurance clicks and no longer has a payback.
Three SKUs: 初期費用チェック ¥1,980 / 退去費用チェック ¥3,980 / 入居〜退去パック ¥4,980.
KOMOJU, not Stripe — the Stripe account is blocked by card-brand risk controls and is not a usable path. Methods: card, PayPay, コンビニ払い. コンビニ matters more than it looks for a 20s–30s renter.
Webhook must be idempotent. KOMOJU will redeliver. Key on `komoju_session_id`, which is already unique. A double-delivery must not grant two entitlements.
The fair-bill case is free. If nothing is contestable, show the full result with no paywall, and say so on the unlock screen: 争える項目がない場合、課金画面は表示されません. This is a trust mechanism, not a concession — it's the cheapest credibility available to us and it's true.
Acceptance: a ¥3,980 purchase in KOMOJU test mode unlocks the report in place and by email; replaying the webhook grants nothing additional; an audit with zero adverse clauses never renders a paywall.
Task 4 — The registry, and `nyukyo` as proof it works
Four reports have shipped `POST /api/taikyo/letter` and `app/(app)/taikyo/workspace`. Both are module-specific where the spec calls for `api/judge`, `api/pdf`, and `a/[module]/...`. Answer this explicitly in the report: does `lib/modules/registry.ts` exist?
Refactor so the module supplies only: `docs`, `intake`, `fieldsSchema`, `extract`, `normalize`, `judge`, `headline`, `templates`, `priceJpy`, `rulebookVersion`. Everything else — upload, confirm, verdict rendering, paywall, PDF, auth, email — is generic and shared.
Then build `nyukyo` far enough to prove the abstraction is real: schema, the ~180-label dictionary mapping to ~22 codes, and the `SHK-*` rule table (仲介手数料 0.55-month ceiling with the timing test, 任意 option classification, 火災保険 self-arrangement, 鍵交換, arithmetic recomputation of 日割り家賃 and totals). Reuse `lib/extract/contract.ts` verbatim — it is the same 賃貸借契約書.
The 仲介手数料 rule tests timing, not presence. 宅建業法46条 and 告示1552号 cap what a broker may take from the tenant at 0.55 months including tax unless the tenant consented when the brokerage was engaged. In 東京高判令和2年1月14日 consent given at contract signing was held too late. A rule that only checks whether consent exists will be wrong in the most common case.
`nyukyo` writes `tenancies`. This is the flywheel. The 特約 extracted at move-in is consumed by `taikyo` years later, and `JudgeContext` carries that record.
Acceptance: adding `nyukyo` required zero new route files and zero new API handlers. If it required either, the registry is not doing its job — say so plainly rather than working around it.
Task 5 — Span-grounded prong verification (Addendum A §A4, never built)
This is the core anti-hallucination mechanism of the 特約 engine and it does not appear in any work report. It is not optional.
For every prong the classifier asserts, it must return the exact substring of the clause supporting that prong. TypeScript then re-checks it:

```ts
function verify(span: string, clause: string, prong: ProngKind): VerifiedSpan | null {
  if (!clause.includes(span)) return null;                      // must appear verbatim
  if (prong === 'amount' && !/[0-9０-９]|万|千/.test(span)) return null;
  if (prong === 'scope'  && !SCOPE_LEXICON.some(w => span.includes(w))) return null;
  return { text: span, start: clause.indexOf(span) };
}

```

Any prong whose span fails verification is forced to `unknown` — not to the model's claimed value. The model may be wrong; it may not be wrong and unchecked. A claimed 「金額明記あり」 that cannot produce a substring containing a numeral is discarded automatically.
Acceptance: an eval that feeds a clause with no amount and a model response claiming P1 true, and asserts the prong lands at `unknown`.
Task 6 — Dual-run agreement (Addendum A §A4 Pass 5, never built)
Every `taikyo` classification runs twice at temperature 0 under two different prompt framings. Disagreement on a clause code or on any prong forces that prong to `unknown` → 立証を求める.
Roughly ¥30 per audit against a ¥3,980 price. It halves the silent-error rate, and silent errors here end with a tenant handing a wrong assertion to a 管理会社.
Acceptance: `eval:dualrun` reports the disagreement rate across the corpus. Report that number — it is a direct measure of extraction reliability and nobody currently knows it.
Task 7 — Split the eval by failure direction
`eval:holdout` 96% and `eval:factloop` 91% are aggregates that hide the thing that matters.

* A false 有効 tells a tenant to pay something they needn't. Cost: their money.
* A false 争う puts a wrong assertion into a letter handed to a 管理会社. Cost: our credibility, the tenant's position, and our legal exposure.

These are not equally bad. Report both directions separately and weight the composite so the dangerous direction dominates. 91% with every failure in the dangerous direction is a worse product than 85% with them in the safe one.
Acceptance: eval output shows `false_valid` and `false_adverse` as separate counts, with examples of each.
Also fix, outside the seven
TK-0037 is a correctness bug, not a backlog item. A citation pointing against its own label means the rule may be inverted. It sits inside a shipped engine. Either resolve it or force the clause to 立証を求める until it is resolved — do not leave it deciding cases.
The letter has one section where the spec has three. Addendum A §A0 specifies 争う / 条件付きで争う / 立証を求める. What shipped covers the first two as a 確認・再検討のお願い, which is well judged. Missing is the third: a demand that the landlord produce move-in condition records and the 施工内訳. Under 民法621条 that burden is theirs, most 管理会社 cannot meet it, and it is the section most likely to produce a reduction without escalation. Right now a `needs_review` clause returns a refusal where it should return a demand.
Egress is being opened to `courts.go.jp`, `mlit.go.jp` and `retio.or.jp`. That should unblock roughly 30 of the 43 outstanding citations for primary verification.
Explicitly not in this ticket
OCR. The decision to refuse scanned PDFs rather than partially extract them was correct — fragment text flowing into segmentation produces a confident verdict over a document never read. But it means the product currently has no camera path, and the entire funnel in the master spec assumes one. That gets its own scoped ticket after V13, with a deliberate decision on engine, accuracy threshold and human review. Until then, launch is paste-and-typing only, which is not a launch.
What "done" looks like
A stranger on a phone can paste a lease, see a free headline number, pay ¥3,980 with PayPay, receive a three-section letter citing only allowlisted authority, close the tab, and open the result a week later from an emailed link. `nyukyo` runs on the same machinery with nothing but its own rules. Every prong in every verdict is backed by a substring that TypeScript checked.Ticket is ready to paste. Seven tasks, ordered so the hard-to-retrofit things land first.

Two notes on how I've framed it for him:

**Task 4 is the one to watch.** I've asked him to answer directly whether `lib/modules/registry.ts` exists, and made the acceptance criterion "adding `nyukyo` required zero new route files and zero new API handlers." If that comes back as "I had to add routes," the merge is architectural in name only and the week-5 simultaneous launch needs rethinking. Better to know now.

**Tasks 5 and 6 are things I specified and he didn't build** — span verification and dual-run. I've said so plainly in the ticket rather than presenting them as new work, because he may have a reason for skipping them that's worth hearing.

One thing I put in the ticket as a statement of fact that you'll need to actually do: opening egress to `courts.go.jp`, `mlit.go.jp` and `retio.or.jp`. That's a settings change on your side and it unblocks roughly 30 of 43 citations for real primary verification. Highest-leverage item on your desk this week, and it's five minutes of work.

OCR is deliberately excluded and flagged as its own ticket. Worth saying plainly: until that exists, there's no camera path, and the funnel in the master spec assumes one. A tenant holding a paper 清算書 and a phone can't use the product. That's the real distance to launch, not the paywall.