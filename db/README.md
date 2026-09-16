# Database

One table (`audits`), no accounts. See `migrations/0001_audits.sql` for the schema
and its own comments for why each column exists, and
`lib/server/audit-store.ts` for the application-level interface everything else in
this product uses instead of talking to Supabase directly.

## This has not been applied to a live project

No Supabase project was attached to the session that wrote these migrations. Every
line has been written directly against Supabase's documented SQL surface, and the
whole `AuditStore` interface has been verified end-to-end (`npm run eval:audit-store`)
against `FileAuditStore`, a behaviourally-identical test double — but
`SupabaseAuditStore` itself has not been run against a real database. Before this
goes to production:

1. Create a Supabase project (or use an existing one scoped to this product).
2. Apply the migrations in order, either with the Supabase CLI:
   ```
   supabase link --project-ref <ref>
   supabase db push
   ```
   or by pasting `migrations/0001_audits.sql` then `migrations/0002_cleanup.sql`
   into the SQL editor, in that order.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API — the
   **service role** key, not the anon key; this table has no RLS policies, so the
   anon key can do nothing against it, which is intentional) in the deployment
   environment.
4. Run `npm run eval:audit-store` with those two variables set and
   `AUDIT_STORE=supabase`, confirm every assertion still passes against the real
   database, then delete the two fixture rows it created (it does clean up after
   itself via `purgeExpired`, but confirm — see the script for exactly what it wrote).

## Scheduling the 90-day cleanup

Two independent options, either sufficient on its own — pick one:

- **pg_cron**, if the project's plan includes it (Database → Extensions in the
  dashboard): uncomment the `cron.schedule(...)` line at the bottom of
  `migrations/0002_cleanup.sql` and re-run it. Runs inside Postgres, closest to the
  data, no external moving part.
- **An external scheduler** hitting `POST /api/taikyo/cleanup` with
  `Authorization: Bearer <CLEANUP_SECRET>` — Vercel Cron
  (`vercel.json` → `crons`), a scheduled GitHub Action, or plain `cron(1)` with
  `curl`. Needed if the hosting plan does not include pg_cron, or if the deployment
  target is not Vercel and a different scheduler is more natural there.

Neither has been wired up and fired against a live schedule in this session — there
is no deployment to schedule against yet. Whichever is chosen, confirm it actually
fires once (check `deleted` in the response, or `select count(*) from audits where
expires_at < now();` before and after) before relying on it.
