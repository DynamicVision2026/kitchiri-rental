# Static legal corpus

The authorities the `taikyo` engine and its outbound letters cite, bundled
into this repo as static files so nothing is fetched at runtime. There is
no egress from this product to a legal database, a court website, or an
LLM at judgment time — `CLAUDE.md` says so, and this directory is the
concrete form that takes: every citation the product can show a tenant
resolves to a file in `texts/`, not a network call.

## What "static" does and does not mean here

Static means the citation is bundled and versioned in-repo. It does **not**
mean verified. Every entry in `manifest.json` carries a
`verification_status` using the same three-value vocabulary the golden-set
corpus already uses (`lib/modules/taikyo/taxonomy.ts` →
`VERIFICATION_STATUSES`):

- `primary_source_verified` — a human read the primary text itself (民集,
  the official e-Gov statute text, the MLIT guideline PDF) and confirmed
  the passage. **No entry in this corpus is at this level yet** — see
  `npm run audit:status`.
- `secondary_source_checked` — cross-read against reputable secondary
  summaries. Enough to catch a misattribution (this project has caught
  one — see `docs/citation-audit-checklist.md`), not enough to stand
  behind unsupervised.
- `unverified` — nobody has checked it this session. Egress to
  courts.go.jp / elaws.e-gov.go.jp / mlit.go.jp is blocked in this
  environment, so nothing here could be raised past
  `secondary_source_checked` even if someone tried today.

Each text file also carries a `content_kind` in its frontmatter:

- `statutory_text` — the file quotes the article itself. Kept short and
  used only where the provision is short enough that a paraphrase would
  add risk rather than remove it (民法621条). Quoted from training-data
  recollection, not transcribed from e-Gov this session — flagged
  `verification_status: unverified` accordingly, same as everything else.
- `holding_paraphrase` — a judgment's holding, summarized in our own
  words. Never a verbatim quotation of judgment text: this project does
  not have reliable primary-text access to Japanese Supreme Court
  opinions, and inventing exact wording for a document a tenant might
  quote at their landlord is exactly the failure mode
  `docs/citation-audit-checklist.md` exists to catch.

## Using this from the engine

`manifest.json` is the index. Each entry's `citation_group_key` matches
the string `scripts/lib/citation-groups.ts`'s `groupKey()` produces for
the same authority, so the golden-set corpus and this legal corpus can be
cross-referenced by the same key without hand-syncing two vocabularies.

## Clearing an entry

`npm run audit:verify -- --status primary --group "<key>" --legal-id
<manifest id> --quote "<verbatim passage from the file>" --evidence "..."
--apply` requires the quoted passage to actually appear in the referenced
`legal/texts/*.md` file before it will set `primary_source_verified` on
the golden-set corpus. See `scripts/citation-verify.ts`.
