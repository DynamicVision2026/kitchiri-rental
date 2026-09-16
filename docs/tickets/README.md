# Ticket archive

Verbatim engineering tickets received during the build, archived as source
material for future work. Text is unedited from what was sent.

- `v13-persistence-identity-paywall.md` — Ticket V13: Persistence, Identity,
  Paywall, and the Missing Safety Rails (Tasks 1–4 delivered; Tasks 5–6
  declined — see the ticket body and session history for why; Task 7 blocked
  on there being no LLM in this system to dual-run against).
- `v14-frontend-design-ui-build.md` — Ticket V14: Front-end Design & UI Build
  (`taikyo`, narrow launch).

## V13/V14 are superseded by V15

Ticket V15 ("`/taikyo` to Production") supersedes both archived tickets
above and closes out the open question below. Per V15's own scope:

- User accounts, magic links, sessions, and the `entitlements`/`tenancies`
  schema from V13 Task 1 are gone — replaced by a single `audits` table
  with no accounts at all (V15 Task 2).
- The multi-module registry and `nyukyo` build-out from V13 Task 4 are
  deferred until `/taikyo` is live and earning revenue (V15 scope note 1).
- The static legal corpus in `legal/manifest.json` (V15 Task 1) replaces
  whatever `addendum-a-tokuyaku-full-depth.md` was meant to formalize —
  citations now carry their own verification tier and file reference
  in-repo, rather than deferring to an external spec.

Treat `v13-persistence-identity-paywall.md` and
`v14-frontend-design-ui-build.md` as historical record of how the product
got here, not as current scope.

## Not archived here: Master Spec and Addendum A

The V13 ticket cited two reference documents by filename —
`chintai-suite-master-spec.md` §1.5/§4.2 and
`addendum-a-tokuyaku-full-depth.md` §A4 — as the source of the original
Supabase schema and the span-verification safety rails. Neither file's
contents were ever supplied in the session that built this repo, only the
citations above, and per the note directly above, V15 has since made both
references moot rather than resolving them. `lib/modules/taikyo/spans.ts`
still credits `Addendum A §A4` in a comment; that comment is now a
pointer to a document that was never real, not a live dependency, and
should be read as historical only.
