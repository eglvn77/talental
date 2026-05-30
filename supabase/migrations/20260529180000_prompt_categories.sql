-- ============================================================
-- Prompt categories.
--
-- Reframes hiring.prompts from "one prompt per fixed key" to
-- "N selectable prompts per CATEGORY". A category is a fixed,
-- code-defined contract (its inputs + output tool/schema live in code
-- and can't be created from the UI): 'kickoff' (role package),
-- 'candidate_report', etc. Within a category the workspace can keep
-- several editable prompts and pick one at run time; one is the
-- default.
--
-- This replaces the old role_type branching: instead of one mega-prompt
-- that switches on role_type, you pick the prompt you want (e.g. a
-- "Headhunting" vs "Inbound AI" kickoff prompt).
-- ============================================================

ALTER TABLE hiring.prompts
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'kickoff',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Existing rows are all kickoff prompts; make the seeded master the
-- category default.
UPDATE hiring.prompts SET category = 'kickoff' WHERE category IS NULL;
UPDATE hiring.prompts SET is_default = true
  WHERE key = 'kickoff_master';

-- One default prompt per (workspace, category).
CREATE UNIQUE INDEX IF NOT EXISTS prompts_one_default_per_category
  ON hiring.prompts (workspace_id, category)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS prompts_workspace_category_idx
  ON hiring.prompts (workspace_id, category);
