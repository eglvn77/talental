-- Pending-review tracking for inbound applications.
--
-- `reviewed_at` is null until the recruiter explicitly opens the
-- candidate detail for this application — that's the moment we
-- count as "seen" for the macOS-style red-dot badge on /jobs.
--
-- A per-user seen-table would have given multi-recruiter granularity
-- but adds fan-out for a team workflow we don't have yet (one of
-- the admins picks up a new app, opens it, decides next step). The
-- simpler timestamp matches today's flow and is trivial to extend.
ALTER TABLE hiring.applications
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Partial index — only unreviewed rows matter for the badge query.
-- Keeps it tiny + fast as the workspace's archive grows.
CREATE INDEX IF NOT EXISTS applications_unreviewed_by_job_idx
  ON hiring.applications (job_id)
  WHERE reviewed_at IS NULL;

-- New source label for the public careers site. ALTER TYPE ADD
-- VALUE must commit before any other statement references it.
ALTER TYPE hiring.candidate_source ADD VALUE IF NOT EXISTS 'careers';
