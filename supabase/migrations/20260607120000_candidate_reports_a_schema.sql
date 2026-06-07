-- ============================================================
-- Candidate Reports — Phase 1: schema + seed prompt
--
-- Today candidate reports are a single text column on hiring.candidates,
-- recruiter-typed by hand. The new flow:
--   1. Interview transcripts (Granola API, manual upload) land in a
--      new hiring.interview_transcripts table.
--   2. Reports become per-application (one candidate × N apps = N
--      reports) instead of per-candidate, since interviews are
--      job-scoped in practice.
--   3. An LLM generates the report by combining all transcripts +
--      CV + LinkedIn enrichment, prioritizing transcripts.
--
-- This migration ships only the storage + the seeded LLM template.
-- The Granola sync, the generation pipeline, and the UI live in
-- follow-up phases (see /Users/eman/.claude/plans/wise-hugging-dijkstra.md).
-- ============================================================

-- 1) Interview transcripts table.
CREATE TABLE IF NOT EXISTS hiring.interview_transcripts (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                uuid        NOT NULL,
  candidate_id                uuid        NOT NULL REFERENCES hiring.candidates(id) ON DELETE CASCADE,
  application_id              uuid                 REFERENCES hiring.applications(id) ON DELETE SET NULL,
  source                      text        NOT NULL CHECK (source IN ('granola','manual','upload')),
  -- Provider id (e.g. Granola note id). Unique per (workspace, source)
  -- so the sync is idempotent — replaying the cron doesn't create dupes.
  external_id                 text,
  title                       text,
  recorded_at                 timestamptz,
  transcript                  text        NOT NULL,
  -- Attendees emails for auto-linking the transcript to the right
  -- application via candidate.email lookup. Shape: [{email, name?}].
  attendees                   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_team_member_id   uuid,
  CONSTRAINT interview_transcripts_external_unique
    UNIQUE (workspace_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS interview_transcripts_candidate_idx
  ON hiring.interview_transcripts (candidate_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS interview_transcripts_application_idx
  ON hiring.interview_transcripts (application_id, recorded_at DESC)
  WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS interview_transcripts_workspace_unlinked_idx
  ON hiring.interview_transcripts (workspace_id, created_at DESC)
  WHERE application_id IS NULL;

ALTER TABLE hiring.interview_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interview_transcripts_workspace_isolation
  ON hiring.interview_transcripts;
CREATE POLICY interview_transcripts_workspace_isolation
  ON hiring.interview_transcripts FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM hiring.team_members WHERE auth_user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM hiring.team_members WHERE auth_user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.interview_transcripts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.interview_transcripts TO authenticated;

-- updated_at auto-bump.
CREATE OR REPLACE FUNCTION hiring.tg_interview_transcripts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interview_transcripts_touch_updated_at
  ON hiring.interview_transcripts;
CREATE TRIGGER interview_transcripts_touch_updated_at
  BEFORE UPDATE ON hiring.interview_transcripts
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_interview_transcripts_touch_updated_at();

-- 2) Report columns on applications.
ALTER TABLE hiring.applications
  ADD COLUMN IF NOT EXISTS candidate_report      text,
  ADD COLUMN IF NOT EXISTS report_generated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS report_model          text,
  ADD COLUMN IF NOT EXISTS report_inputs         jsonb,
  ADD COLUMN IF NOT EXISTS report_edited_at      timestamptz;

-- 3) Seed candidate_report prompt — one row per existing workspace.
-- Idempotent via the unique index prompts_one_default_per_category
-- (workspace_id, category) WHERE is_default — so re-running won't
-- duplicate the default for a workspace that already has one.
INSERT INTO hiring.prompts (
  workspace_id, key, label, category, is_default, model, body
)
SELECT
  w.id,
  'candidate_report_master',
  'Candidate report — master',
  'candidate_report',
  true,
  'claude-sonnet-4-20250514',
  $body$# Candidate report generator

You are a senior recruiter producing a structured candidate report after one or more interviews. The report goes to the hiring team and to the client portal, so it needs to be honest, specific, and tied to the job's requirements.

You will receive:
- Job context (title, requirements, modality, salary range if known)
- Candidate basics (name, current title, current company, location)
- 1+ interview transcripts (the recruiter's conversation — this is the PRIMARY signal)
- The candidate's CV text if uploaded
- Their LinkedIn / Coresignal-enriched profile if available

Priority of evidence: **transcripts > CV > LinkedIn/experience**. When multiple sources cover the same point, cite the transcript first.

Output via the `populate_candidate_report` tool with:
- **overall_rating**: one of `strong_yes`, `yes`, `lean_yes`, `lean_no`, `no`
- **summary**: 1-2 paragraph markdown overview that ties to the job's requirements. Lead with the bottom line.
- **strengths**: array of `{ point, evidence }` — what the candidate brings. Evidence is a short quote (or paraphrase) from the transcript/CV/profile that supports the point.
- **concerns**: array of `{ point, evidence }` — gaps, flags, or unverified claims. Same evidence rule.
- **to_probe**: array of strings — concrete questions the next interview should answer.
- **compensation**: `{ stated, range?, currency?, notes? }` — only `stated=true` when the transcript actually covered it. Otherwise `stated=false`, range/currency/notes null.
- **recommendation**: 2-3 sentences advising the hiring team on next steps (advance / pass / specific probes).
- **input_provenance**: `{ transcripts_used: [{id, title}], cv_used: bool, enrichment_used: bool }`

Rules:
1. **Never fabricate quotes.** If something is unsupported, label it "unverified" or skip it.
2. **No generic praise.** Strengths/concerns must connect to specific job requirements. "Good communicator" doesn't count; "Communicates technical trade-offs clearly — described the cache-invalidation decision in detail" does.
3. **If there are no transcripts AND no CV**, your overall_rating must be `lean_no` or `no`, and the summary must say there's not enough signal to evaluate.
4. **Match the workspace language** — Spanish for Talental. Quotes from English transcripts can stay in English.
5. **Compensation**: only fill `stated=true` if the recruiter and candidate actually discussed numbers. Inferences from the JD don't count.
6. **Length discipline**: 3-7 strengths, 1-5 concerns, 2-5 to_probe. Don't pad.
$body$
FROM hiring.workspaces w
ON CONFLICT (workspace_id, category) WHERE is_default
DO NOTHING;
