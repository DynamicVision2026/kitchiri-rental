-- V15 Task 2 — 90-day expiry, the deletion half.
--
-- audits.expires_at (0001_audits.sql) marks WHEN a row should go; this migration adds
-- the function that actually deletes expired rows. It is invoked two ways, and both
-- are provided because this session cannot attach a live scheduler to verify either
-- end-to-end — see db/README.md "Scheduling this" for what still needs setting up
-- against a real project:
--
--   1. `select delete_expired_audits();` — callable directly, e.g. from Supabase's own
--      pg_cron if the project's plan includes it.
--   2. POST /api/taikyo/cleanup (lib/server/audit-store.ts -> AuditStore.purgeExpired)
--      — callable from an external scheduler (Vercel Cron, GitHub Actions, cron(1))
--      that does not depend on the Postgres extension being available.
--
-- Either path is sufficient on its own; the API route does not require this function
-- to exist (it runs the equivalent DELETE via the JS client), but the SQL function is
-- offered for the pg_cron path because that runs cheaper and closer to the data.

create or replace function delete_expired_audits() returns integer as $$
declare
  deleted_count integer;
begin
  delete from audits where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql;

comment on function delete_expired_audits() is
  'Deletes every audits row past its expires_at. Returns the count deleted. See db/README.md for scheduling.';

-- Uncomment if the project's plan includes the pg_cron extension and it is already
-- enabled (Database -> Extensions in the Supabase dashboard). Not run automatically
-- by this migration, because enabling an extension the plan does not support fails
-- the whole migration.
--
-- select cron.schedule('delete-expired-audits', '0 * * * *', 'select delete_expired_audits();');
