-- Row-level security (S8). Privacy is decided here, not in prompts.
--
-- Who is asking comes from the verified JWT: Supabase Auth puts
-- app_metadata.role ('member' or 'staff') and, for members,
-- app_metadata.company_id into every access token. Users cannot change
-- app_metadata. PostgREST sets request.jwt.claims; lib/db/user.ts sets the same
-- setting for Drizzle queries.
--
-- Rules:
--   * BSP's public data (companies, public claims, snapshots, opportunities,
--     source status, eval results) is readable by every signed-in user.
--   * Anything a member enters (private claims, priorities, personal matches,
--     feedback, saved items, chats, briefs) is readable only by that company.
--   * Staff read public data and public matches only, plus handoffs, which a
--     member sends to staff on purpose. Staff never read chats.
--   * Jobs connect as the table owner (service role / DATABASE_URL) and bypass
--     these rules.

-- ---------------------------------------------------------------------------
-- Helpers. Kept out of the public schema so PostgREST does not expose them.
-- ---------------------------------------------------------------------------

create schema if not exists app;--> statement-breakpoint
grant usage on schema app to anon, authenticated, service_role;--> statement-breakpoint

create or replace function app.claims() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;--> statement-breakpoint

create or replace function app.user_id() returns uuid
language sql stable
as $$
  select nullif(app.claims() ->> 'sub', '')::uuid
$$;--> statement-breakpoint

create or replace function app.role() returns text
language sql stable
as $$
  select app.claims() -> 'app_metadata' ->> 'role'
$$;--> statement-breakpoint

create or replace function app.company_id() returns uuid
language sql stable
as $$
  select case
    when app.role() = 'member' then nullif(app.claims() -> 'app_metadata' ->> 'company_id', '')::uuid
  end
$$;--> statement-breakpoint

create or replace function app.is_staff() returns boolean
language sql stable
as $$
  select coalesce(app.role() = 'staff', false)
$$;--> statement-breakpoint

grant execute on all functions in schema app to anon, authenticated, service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Turn RLS on everywhere. A table with RLS and no policy returns no rows.
-- ---------------------------------------------------------------------------

alter table companies enable row level security;--> statement-breakpoint
alter table company_private enable row level security;--> statement-breakpoint
alter table snapshots enable row level security;--> statement-breakpoint
alter table claims enable row level security;--> statement-breakpoint
alter table evidence enable row level security;--> statement-breakpoint
alter table opportunities enable row level security;--> statement-breakpoint
alter table matches enable row level security;--> statement-breakpoint
alter table feedback enable row level security;--> statement-breakpoint
alter table saved_items enable row level security;--> statement-breakpoint
alter table chats enable row level security;--> statement-breakpoint
alter table briefs enable row level security;--> statement-breakpoint
alter table handoffs enable row level security;--> statement-breakpoint
alter table source_status enable row level security;--> statement-breakpoint
alter table job_runs enable row level security;--> statement-breakpoint
alter table eval_runs enable row level security;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Public data
-- ---------------------------------------------------------------------------

create policy companies_read on companies
  for select to authenticated using (true);--> statement-breakpoint

create policy snapshots_read on snapshots
  for select to authenticated using (true);--> statement-breakpoint

create policy opportunities_read on opportunities
  for select to authenticated using (true);--> statement-breakpoint

create policy source_status_read on source_status
  for select to anon, authenticated using (true);--> statement-breakpoint

create policy eval_runs_read on eval_runs
  for select to anon, authenticated using (true);--> statement-breakpoint

create policy job_runs_staff_read on job_runs
  for select to authenticated using ((select app.is_staff()));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Profiles: public claims for everyone, private ones for their own company
-- ---------------------------------------------------------------------------

create policy claims_read on claims
  for select to authenticated
  using (visibility = 'public' or company_id = (select app.company_id()));--> statement-breakpoint

-- Members write their own corrections. Profiler claims come from jobs.
create policy claims_member_insert on claims
  for insert to authenticated
  with check (company_id = (select app.company_id()) and updated_by = 'user');--> statement-breakpoint

-- Members may accept or reject suggestions and edit claims of their own company.
create policy claims_member_update on claims
  for update to authenticated
  using (company_id = (select app.company_id()))
  with check (company_id = (select app.company_id()));--> statement-breakpoint

-- Evidence is visible exactly when its claim is (the claims policy applies inside).
create policy evidence_read on evidence
  for select to authenticated
  using (exists (select 1 from claims c where c.id = evidence.claim_id));--> statement-breakpoint

create policy company_private_own on company_private
  for all to authenticated
  using (company_id = (select app.company_id()))
  with check (company_id = (select app.company_id()));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Matches: personal for the company only; public for the company and staff
-- ---------------------------------------------------------------------------

create policy matches_read on matches
  for select to authenticated
  using (
    company_id = (select app.company_id())
    or (mode = 'public' and (select app.is_staff()))
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Member activity: own company only
-- ---------------------------------------------------------------------------

create policy feedback_own on feedback
  for all to authenticated
  using (company_id = (select app.company_id()))
  with check (company_id = (select app.company_id()) and user_id = (select app.user_id()));--> statement-breakpoint

create policy saved_items_own on saved_items
  for all to authenticated
  using (company_id = (select app.company_id()))
  with check (company_id = (select app.company_id()) and user_id = (select app.user_id()));--> statement-breakpoint

create policy chats_own_read on chats
  for select to authenticated
  using (company_id = (select app.company_id()));--> statement-breakpoint

create policy chats_own_insert on chats
  for insert to authenticated
  with check (company_id = (select app.company_id()) and user_id = (select app.user_id()));--> statement-breakpoint

create policy briefs_own on briefs
  for all to authenticated
  using (company_id = (select app.company_id()))
  with check (company_id = (select app.company_id()) and user_id = (select app.user_id()));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Handoffs: the member sends, staff read and close
-- ---------------------------------------------------------------------------

create policy handoffs_read on handoffs
  for select to authenticated
  using (company_id = (select app.company_id()) or (select app.is_staff()));--> statement-breakpoint

create policy handoffs_member_insert on handoffs
  for insert to authenticated
  with check (company_id = (select app.company_id()) and user_id = (select app.user_id()));--> statement-breakpoint

create policy handoffs_staff_update on handoffs
  for update to authenticated
  using ((select app.is_staff()))
  with check ((select app.is_staff()));
