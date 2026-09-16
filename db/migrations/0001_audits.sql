-- V15 Task 2 — the single `audits` table.
--
-- No accounts, no sessions, no `users`/`entitlements`/`tenancies` tables from the
-- superseded V13 plan (see docs/tickets/README.md). One row per audit, keyed by an
-- unguessable UUID that IS the credential: the report URL is /taikyo/r/<id>, and
-- possessing that id is the only access control this product has. Nothing here reads
-- or writes without the service-role key — RLS is enabled with NO policies, so
-- PostgREST/anon access is denied outright and every read or write goes through a
-- server route using SUPABASE_SERVICE_ROLE_KEY.
--
-- Apply with the Supabase CLI (`supabase db push`) against a real project, or paste
-- directly into the SQL editor. See db/README.md — there is no live project attached
-- to the session that authored this migration, so it has not been run against one.

create extension if not exists pgcrypto;

create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- V15 scope is /taikyo only (see docs/tickets/README.md). The column exists so a
  -- later /shoki (nyukyo) launch is an added enum value, not a new table.
  module text not null default 'taikyo' check (module in ('taikyo')),

  -- The pasted or PDF-extracted lease text the free analysis ran against, and the
  -- full computed report (BatchReportResponse, reasonsText already resolved). Both
  -- are needed to re-render the paid report and the PDF export without re-running
  -- the engine, and without a session to hold them in.
  contract_text text not null,
  report jsonb not null,

  amount_jpy integer not null default 3980 check (amount_jpy > 0),

  -- Set once, by the orders/paid webhook. Null means unpaid — the free S3 result only.
  paid_at timestamptz,
  -- Unique and nullable: enforces at the database level that two different audits can
  -- never both claim the same Shopify order, which is the idempotency backstop below
  -- the application-level check in lib/server/audit-store.ts.
  shopify_order_id text unique,
  shopify_order_number text,
  customer_email text,

  -- Set by the refunds/create webhook. A revoked audit is never deleted outright
  -- (so a support conversation about "why was I refunded" still has the record) but
  -- GET /api/taikyo/audits/:id must treat it as inaccessible, same as unpaid.
  revoked_at timestamptz,
  revoked_reason text,

  -- 90-day retention, per the Privacy Policy: created_at + 90 days at insert, and
  -- moved out to paid_at + 90 days when payment lands, so a customer who pays weeks
  -- after their free scan still gets a full 90-day window on the report they bought.
  expires_at timestamptz not null default (now() + interval '90 days')
);

create index if not exists audits_expires_at_idx on audits (expires_at);
create index if not exists audits_shopify_order_id_idx on audits (shopify_order_id) where shopify_order_id is not null;

create or replace function audits_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists audits_updated_at on audits;
create trigger audits_updated_at
  before update on audits
  for each row execute function audits_set_updated_at();

alter table audits enable row level security;
-- No policies. anon and authenticated have no access whatsoever — every read and
-- write goes through a Next.js API route using the service-role key, which bypasses
-- RLS by design. This is deliberate given "no accounts": there is no Supabase Auth
-- user to write a policy against.

comment on table audits is
  'V15: single table, no accounts. id is the bearer credential for /taikyo/r/<id>. See docs/tickets/README.md and legal/README.md for what this supersedes.';
