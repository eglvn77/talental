-- Distinguish "positive close" (Filled / Hired — instant) from
-- "negative close" (Cancelled / On hold — needs a reason). When this
-- flag is false on an `is_archived=true` status, updateJobStatusAction
-- skips the closure-reason requirement and the status-select UI
-- skips the dialog. `closed_at` is still set.

alter table hiring.job_statuses
  add column if not exists requires_closure_reason boolean not null default true;

-- Auto-mark the seeded "cubierta" (Filled) status as skip-reason for
-- every workspace. Cancellation-style statuses keep the default true.
update hiring.job_statuses
set requires_closure_reason = false
where key = 'cubierta';
