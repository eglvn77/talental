-- =====================================================
-- hiring.jobs.recruiter_team_member_id — assign the sourcer /
-- recruiter who owns the placement commission at job-opening time.
--
-- The percentage (recruiter_split_pct) already exists from the
-- previous fee-terms migration. This adds the "who" part: the
-- team_member that the % is owed to when the role closes.
--
-- ON DELETE SET NULL so removing a team_member doesn't cascade-
-- delete jobs.
-- =====================================================

ALTER TABLE hiring.jobs
  ADD COLUMN recruiter_team_member_id uuid
    REFERENCES hiring.team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_recruiter_team_member_idx
  ON hiring.jobs (recruiter_team_member_id)
  WHERE recruiter_team_member_id IS NOT NULL;
