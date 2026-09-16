Ticket V14 — Front-end Design & UI Build (`taikyo`, narrow launch)
Runs in parallel with V13. No dependency on Supabase, Resend or KOMOJU credentials — build every screen against fixtures, including the paid and post-payment states. When credentials land, the wiring is a swap, not a rebuild.
Scope: the full `taikyo` funnel, paste-and-PDF only (no camera path yet). Mobile-first.
1. What this product is, and what the design job is
A tenant has just received a bill for ¥140,000 they don't understand, from a company with a lawyer, and they have about two weeks. They are frightened and they are going to hand our output to that company.
So the design job is credibility, not delight. Every choice answers one question: does this look like something a 管理会社 would take seriously when the tenant sends it?
That rules out most of what a consumer web product would reach for. No gradients, no illustration, no mascot, no soft rounded SaaS cards, no countdown timers, no "347 people checked their bill today," no testimonials, no urgency of any kind. We are not persuading anyone to act fast. We are showing them what the rules say.
The nearest visual relatives are a 行政書士 office's document, a 国民生活センター notice, and a well-set financial statement. Not a startup landing page. But it must not be ugly or bureaucratic either — the tenant has to trust it and get through it on a phone at 11pm while upset.
Spend the boldness in one place: the headline number on the result screen. Everything else stays quiet.
2. Design direction
Work the two-pass process: write the token plan first, check it against this brief, then build. Specific constraints for this project:
Palette
Four to six named values, no more. Ink-on-paper as the base — a true near-white, not a cream (cream reads as "wellness brand" and this is a dispute tool). One accent, used only for the adverse verdict and the primary action, so that seeing it anywhere means "this is contestable." Verdicts already use colour + glyph + word; keep all three, and make sure the design still reads correctly in greyscale, because tenants print this.
Avoid: warm-clay accents near #D97757, acid green on near-black, and tinted near-blacks standing in for black.
Type
Japanese typography has specific requirements that generic stacks get wrong.

* System stack, no webfont download on the critical path: `-apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic Medium", Meiryo, sans-serif`. A 200KB Japanese webfont on a phone at 11pm is a real cost for no gain.
* Line-height 1.7–1.8 for Japanese body text. The 1.5 that works for Latin is too tight for kanji and is the single most common tell that a Japanese page was designed by someone who doesn't read it.
* No `letter-spacing` on Japanese body text. Never `text-align: justify` — Japanese justification without proper 禁則処理 produces broken lines.
* Numerals are the content here. Set money in a tabular-figure treatment so `¥142,000` and `¥87,000` align vertically down a column. This is not a detail; the entire report is a column of yen figures the user compares.
* One serif moment, and only one: the letter preview. The 異議申立て書 should be set in 明朝 (`"Hiragino Mincho ProN", "Yu Mincho", serif`) because that's what Japanese business correspondence looks like, and seeing it that way is what tells the tenant it's real. Everywhere else, gothic.
* No ALL-CAPS labels (meaningless in Japanese anyway), no tracked-out eyebrows, no monospace for data labels.

Layout
Left-aligned throughout. Single column on mobile, max ~640px measure on desktop — this is a document, not a dashboard. Structural devices must encode information: a rule under a section means a section boundary, a number means an actual sequence. The letter's three stances are a real hierarchy; the upload steps are a real sequence; nothing else gets numbered.
Primary actions within thumb reach, bottom of viewport on mobile.
Motion
One orchestrated moment only: the reveal of the headline number after analysis. Nothing else animates. No fade-and-slide on scroll, no hover transitions on cards. Respect `prefers-reduced-motion`.
3. Screens
S0 — Landing (`/taikyo`)
Hero is the problem stated in the tenant's own words, then the upload box. No hero image.

```
┌────────────────────────────────┐
│  その退去費用、本当に払う          │
│  必要がありますか。               │
│                                │
│  精算書と契約書の内容を貼り付ける   │
│  だけ。国土交通省のガイドライン     │
│  に照らして、貸主負担の可能性が     │
│  ある項目を判定します。            │
│                                │
│  ┌──────────────────────────┐  │
│  │  [ 無料で診断する ]        │  │
│  └──────────────────────────┘  │
│                                │
│  妥当な請求なら、そう伝えます。     │
├────────────────────────────────┤
│  引用した法令・判例は一次資料未確認  │
│  です。(notice — above the fold) │
├────────────────────────────────┤
│  何を根拠に判定しているか  →/kijun │
│  サンプルレポートを見る            │
│  獨歩文化株式会社 / 特商法表記      │
└────────────────────────────────┘

```

The unverified-citation notice goes above the fold, as already implemented. It costs conversion and it buys the right to exist.
S1 — Ingest
Paste box and PDF drop zone, equal weight. The scan-refusal message must explain why and what to do instead — it is currently the most likely dead end in the funnel, so treat it as a real screen with a real path forward, not an error toast.
Extracted text lands in an editable box before analysis, as built. Label it so the user knows they're expected to read it.
S2 — Confirm (the liability firewall)
The highest-stakes screen in the product and the one most likely to be designed badly.
The user is holding paper. Their job is to check our transcription against it. Design for that literal act: clause text large enough to read on a phone, generous spacing between clauses, an obvious per-clause "this matches" affordance, and low-confidence clauses visually distinct without being alarming. Never bury this in an accordion — collapsed content does not get checked.
S3 — Free result
The one bold moment.

```
┌────────────────────────────────┐
│  請求額 ¥142,000 のうち          │
│                                │
│     ¥87,000                    │  ← the single largest thing
│                                │
│  が貸主負担の可能性があります      │
│                                │
│  争える      ████████  ¥62,000  │
│  条件付き    ███       ¥25,000  │
│  妥当        █████     ¥55,000  │
└────────────────────────────────┘

```

Below: clause labels visible, per-line amounts and all reasoning masked. The mask must read as "not yet shown," not as "broken." A blur filter over real text is the honest treatment; a grey rectangle is not.
The 妥当 case is a design problem, not an edge case. When nothing is contestable there is no paywall and the full result is free. That screen has to feel like value received, not a wasted trip. Lead with 「この請求は概ね妥当です」 and give them the per-clause reasoning in full — they came for an answer and they got one.
S4 — Unlock
Price, the four deliverables, a real sample PDF viewable in full, payment methods. One honest line: 争える項目がない場合、課金画面は表示されません.
No scarcity. No "most popular" badge. Build the ¥4,980 pack option but leave it visually quieter than the single audit — the merge is strategy, not a bundle upsell.
S5 — Report
Per-clause: verdict, amount, reasoning, citation with its verification tier visible. The tier is not fine print. A secondary-verified citation should look different from a primary-verified one, because we told the user it matters.
S6 — Letter
Three stances as three visible sections with distinct weight: 争う / 条件付きで争う / 立証を求める. 明朝 preview. Per-clause toggles before generating. Copy, .txt, PDF.
4. Copy rules
Plain verbs, sentence case, active voice. The button that says 診断する produces a screen that says 診断結果.
Banned in every string, enforced by test: 違法, 不当, ぼったくり, 詐欺, 支払う必要はありません as an assertion. We describe rules and let the tenant conclude. This is the 弁護士法72条 discipline and it lives in the UI copy as much as in the engine.
Errors state what happened and what to do. They do not apologise and they are never vague. Empty states invite the next action.
5. Quality floor
Responsive to 320px. Visible keyboard focus. `aria-live` on results and ingestion, `role="alert"` on errors — already in place, don't regress it. Verdicts legible in greyscale and to colour-blind users. `prefers-reduced-motion` respected. Print stylesheet for the report and the letter, because tenants will print these.
6. Deliverable
Every screen built against fixtures, including paid and post-payment states, so V13's wiring is a swap. Take screenshots and critique them before reporting — a picture is worth a thousand tokens.
Report back with the token plan and the reasoning for the two or three choices you're least sure about.