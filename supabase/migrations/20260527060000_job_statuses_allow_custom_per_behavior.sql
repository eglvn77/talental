-- Allow workspaces to add custom statuses that ride on top of the
-- four canonical behaviors. Drops the one-per-behavior UNIQUE.
-- Reports still group by the flag triple (is_open / is_archived /
-- is_filled), so multiple rows under the same behavior just split
-- into sub-buckets — never break the funnel.
--
-- The remaining guardrails stay in place:
--   • job_statuses_open_archived_mutex  (NOT (is_open AND is_archived))
--   • job_statuses_filled_requires_archived (NOT is_filled OR is_archived)
--   • UNIQUE (workspace_id, key)  (no slug collisions)
--   • is_system rows are non-deletable (enforced server-side)
--
-- Behavior of a row is locked at create time: app actions never
-- patch is_open / is_archived / is_filled after insert.
ALTER TABLE hiring.job_statuses
  DROP CONSTRAINT IF EXISTS job_statuses_one_per_behavior_per_workspace;
