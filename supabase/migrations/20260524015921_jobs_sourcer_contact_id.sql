-- =====================================================
-- hiring.jobs.sourcer_contact_id — switch sourcer FK from
-- team_members to contacts.
--
-- The original recruiter_team_member_id assumed the sourcer was an
-- internal team_member (a workspace user). The actual workflow at
-- boutique scale is external freelance recruiters who exist as
-- contacts in the CRM, not as workspace users. Switch the FK target
-- to hiring.contacts and let the UI search the contact directory
-- (with inline-create when the recruiter is new).
--
-- recruiter_team_member_id stays in place but unused. We don't drop
-- it because (a) the column was added two days ago and could still
-- have stale references in early test data, and (b) we may revive
-- it later if we model placement events with an internal "closer"
-- distinct from the external sourcer.
-- =====================================================

ALTER TABLE hiring.jobs
  ADD COLUMN sourcer_contact_id uuid
    REFERENCES hiring.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_sourcer_contact_idx
  ON hiring.jobs (sourcer_contact_id)
  WHERE sourcer_contact_id IS NOT NULL;
