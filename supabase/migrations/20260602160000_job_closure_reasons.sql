-- Closure-reason taxonomy for jobs that are transitioning to an
-- archived status. Captures finer-grained "why" than the status itself
-- (e.g. an `is_archived=true` status of "Filled" can be sub-categorized
-- as "Hired (placed by us)" vs "Filled internally by client"). Mirrors
-- the rejection_reasons table shape and policies.

create table if not exists hiring.job_closure_reasons (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references hiring.workspaces(id) on delete cascade,
  name          text not null,
  position      integer not null default 0,
  is_active     boolean not null default true,
  is_system     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists job_closure_reasons_workspace_id_idx
  on hiring.job_closure_reasons(workspace_id, position);

-- MCP-created tables don't auto-grant — see feedback_supabase_mcp_grants.
grant select, insert, update, delete on hiring.job_closure_reasons to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on hiring.job_closure_reasons to service_role;

alter table hiring.job_closure_reasons enable row level security;

create policy tenant_select on hiring.job_closure_reasons
  for select to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()));

create policy tenant_insert on hiring.job_closure_reasons
  for insert to authenticated
  with check (workspace_id in (select hiring.user_workspace_ids()));

create policy tenant_update on hiring.job_closure_reasons
  for update to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()))
  with check (workspace_id in (select hiring.user_workspace_ids()));

create policy tenant_delete on hiring.job_closure_reasons
  for delete to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()));

-- jobs gets a structured pointer + freetext notes captured at close.
alter table hiring.jobs
  add column if not exists closure_reason_id uuid
    references hiring.job_closure_reasons(id) on delete set null,
  add column if not exists closure_notes text;

create index if not exists jobs_closure_reason_id_idx
  on hiring.jobs(closure_reason_id);

-- Seed defaults per existing workspace. Marked is_system=true so the
-- signup-time seed can identify and skip them on re-runs.
with seeds(name, ord) as (
  values
    ('Hired (placed by us)', 10),
    ('Filled internally by client', 20),
    ('Cancelled by client', 30),
    ('Cancelled by Talental', 40),
    ('On hold indefinitely', 50),
    ('Filled by another agency', 60),
    ('Other', 70)
)
insert into hiring.job_closure_reasons (workspace_id, name, position, is_active, is_system)
select w.id, s.name, s.ord, true, true
from hiring.workspaces w
cross join seeds s
where not exists (
  select 1 from hiring.job_closure_reasons jcr
  where jcr.workspace_id = w.id
);
