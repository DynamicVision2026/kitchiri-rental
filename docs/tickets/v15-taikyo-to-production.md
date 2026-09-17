Ticket V15 — /taikyo to Production (Active Deployment)

Repo: kitchiri-rental

All architectural decisions and external constraints are locked. Read this exact scope before starting:

1. **Core Scope & Pricing**:
   - Focus 100% on `/taikyo` (Rental exit audit). Price: ¥3,980.
   - `/shoki` and the broader multi-module matrix are officially deferred until `/taikyo` is live and generating revenue.

2. **Architecture & Delivery (No Accounts)**:
   - Zero user accounts, zero magic links, zero sessions, zero entitlements.
   - Payment via Shopify Checkout (Shopify store name is now set to Beyond Culture).
   - Post-purchase: Shopify `orders/paid` webhook verifies HMAC, reads `audit_id` from cart attributes, updates the single `audits` table, and sends a secure, unguessable UUID report URL via email. The unguessable ID IS the credential.

3. **Static Legal Corpus (No Runtime Egress)**:
   - Create `legal/` at root with `manifest.json` and bundled static texts (statutes, MLIT guideline, Supreme Court judgments — no copyrighted RETIO articles).
   - Implement `audit:verify --status primary` backed by file references and quoted passages.

4. **Tasks to Execute (V15)**:
   - **Task 1**: Static legal corpus & manifest setup.
   - **Task 2**: Minimal persistence (`audits` table with 90-day expiry).
   - **Task 3**: Shopify Checkout & Webhook handler (idempotent, HMAC verification, refund handling).
   - **Task 4**: Playwright PDF export handler (dedicated print route, A4, gothic for report, mincho for letter, aligned yen column).
   - **Task 5**: Port live workspace onto V14 components and retire `/preview`.
   - **Task 6**: Build `/taikyo/kijun` (the rulebook whitepaper page).
   - **Task 7**: Required legal pages (Tokushoho, Terms of Service, Privacy Policy including 90-day deletion and Shopify data processing).

Let's execute Task 1 through Task 7 cleanly and get `/taikyo` ready for production. Report back upon build verification and test-mode purchase success.

---

## Mid-session note from the user (V13/V14 supersession)

Don't worry about finding or writing those legacy documents [`chintai-suite-master-spec.md`,
`addendum-a-tokuyaku-full-depth.md`]. Ticket V15 completely supersedes V13/V14 and all references to
`chintai-suite-master-spec.md` or `addendum-a-tokuyaku-full-depth.md`.

Under V15:
- User accounts and session tables are gone.
- The static legal corpus in `legal/` and `manifest.json` replaces the old citation specs (Task 1).
- The single-module scope (`/taikyo`) renders the old registry and multi-module specs obsolete.

Please update `docs/tickets/README.md` to note that V13/V14 legacy specs are superseded by V15, and proceed
directly with V15 Tasks 1 through 7.
