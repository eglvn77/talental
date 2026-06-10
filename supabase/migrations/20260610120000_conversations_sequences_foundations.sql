-- ============================================================
-- Foundations for Conversations + Sequences modules (Unipile).
-- Applied to prod via Supabase MCP on 2026-06-10 under the name
-- `conversations_sequences_foundations`; mirrored here for history.
-- 1) messages: draft/send lifecycle for agent drafts + UI sends
-- 2) conversations: attendee identity for not-yet-linked chats
-- 3) sequences: priority, entry conditions, send-window settings
-- 4) sequence_steps: full Leonar channel set, branching graph,
--    execution mode, sender config
-- 5) sequence_enrollments: replied_at
-- 6) NEW hiring.sequence_queue: scheduled action queue
-- 7) NEW hiring.agent_review_queue: monitor doubts for the agent
-- ============================================================

-- 1) messages lifecycle ------------------------------------------------
alter table hiring.messages
  add column if not exists status text not null default 'sent',
  add column if not exists send_error text;
alter table hiring.messages
  add constraint messages_status_check
  check (status in ('draft','queued','sent','failed'));

-- 2) conversations attendee -------------------------------------------
alter table hiring.conversations
  add column if not exists attendee_name text,
  add column if not exists attendee_identifier text;

-- 3) sequences config ---------------------------------------------------
alter table hiring.sequences
  add column if not exists priority integer not null default 0,
  add column if not exists entry_conditions jsonb not null default '[]'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- 4) sequence_steps: channels + branching graph -------------------------
alter type hiring.sequence_step_kind add value if not exists 'linkedin_invitation';
alter type hiring.sequence_step_kind add value if not exists 'linkedin_inmail';
alter type hiring.sequence_step_kind add value if not exists 'linkedin_profile_view';
alter type hiring.sequence_step_kind add value if not exists 'phone_call';
alter type hiring.sequence_step_kind add value if not exists 'email_enrichment';
alter type hiring.sequence_step_kind add value if not exists 'phone_enrichment';

alter table hiring.sequence_steps
  add column if not exists execution_mode text not null default 'automatic',
  add column if not exists sender_account_id uuid references hiring.connected_accounts(id) on delete set null,
  add column if not exists sender_rotation boolean not null default false,
  add column if not exists parent_step_id uuid references hiring.sequence_steps(id) on delete cascade,
  add column if not exists branch_path text,
  add column if not exists branch_condition text;
alter table hiring.sequence_steps
  add constraint sequence_steps_execution_mode_check
  check (execution_mode in ('automatic','manual'));
alter table hiring.sequence_steps
  add constraint sequence_steps_branch_path_check
  check (branch_path is null or branch_path in ('yes','no'));
alter table hiring.sequence_steps
  add constraint sequence_steps_branch_condition_check
  check (branch_condition is null or branch_condition in
    ('already_contacted','connected_on_linkedin','has_email','has_phone'));

-- Branching makes (sequence_id, position) non-unique globally; position
-- is now unique per branch lane instead.
alter table hiring.sequence_steps
  drop constraint if exists sequence_steps_sequence_id_position_key;
create unique index if not exists sequence_steps_lane_position_key
  on hiring.sequence_steps (sequence_id, coalesce(parent_step_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(branch_path, ''), position);

-- 5) enrollments --------------------------------------------------------
alter table hiring.sequence_enrollments
  add column if not exists replied_at timestamptz;

-- 6) sequence_queue ------------------------------------------------------
create table if not exists hiring.sequence_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references hiring.workspaces(id) on delete cascade,
  sequence_id uuid not null references hiring.sequences(id) on delete cascade,
  enrollment_id uuid not null references hiring.sequence_enrollments(id) on delete cascade,
  step_id uuid not null references hiring.sequence_steps(id) on delete cascade,
  type hiring.sequence_step_kind not null,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed','cancelled')),
  scheduled_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sequence_queue_due_idx
  on hiring.sequence_queue (status, scheduled_at);
create index if not exists sequence_queue_enrollment_idx
  on hiring.sequence_queue (enrollment_id);
create index if not exists sequence_queue_sequence_idx
  on hiring.sequence_queue (sequence_id, status);

alter table hiring.sequence_queue enable row level security;
grant select, insert, update, delete on hiring.sequence_queue to authenticated;
grant select, insert, update, delete on hiring.sequence_queue to service_role;

create policy tenant_select on hiring.sequence_queue
  for select to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()));
create policy tenant_insert on hiring.sequence_queue
  for insert to authenticated
  with check (workspace_id in (select hiring.user_workspace_ids()));
create policy tenant_update on hiring.sequence_queue
  for update to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()))
  with check (workspace_id in (select hiring.user_workspace_ids()));
create policy tenant_delete on hiring.sequence_queue
  for delete to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()));

-- 7) agent_review_queue ---------------------------------------------------
create table if not exists hiring.agent_review_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references hiring.workspaces(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','reported','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists agent_review_queue_pending_idx
  on hiring.agent_review_queue (workspace_id, status, created_at);

alter table hiring.agent_review_queue enable row level security;
grant select, insert, update, delete on hiring.agent_review_queue to authenticated;
grant select, insert, update, delete on hiring.agent_review_queue to service_role;

create policy tenant_select on hiring.agent_review_queue
  for select to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()));
create policy tenant_insert on hiring.agent_review_queue
  for insert to authenticated
  with check (workspace_id in (select hiring.user_workspace_ids()));
create policy tenant_update on hiring.agent_review_queue
  for update to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()))
  with check (workspace_id in (select hiring.user_workspace_ids()));
create policy tenant_delete on hiring.agent_review_queue
  for delete to authenticated
  using (workspace_id in (select hiring.user_workspace_ids()));
