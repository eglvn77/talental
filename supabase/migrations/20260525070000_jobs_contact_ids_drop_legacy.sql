-- Replace freeform hiring_manager_name with a multi-select of
-- hiring.contacts rows (the people on the client side — hiring
-- manager, sourcing partner, referente, etc.). Stored as an array
-- of contact UUIDs on the job row.
--
-- Drop two legacy fields removed from the Ajustes UI:
--   - target_start_date
--   - language_requirements
-- They had no other reader in the app (only OverviewEditor, now
-- gone). Cleared from the schema so the model matches the product.

ALTER TABLE hiring.jobs
  ADD COLUMN IF NOT EXISTS contact_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE hiring.jobs
  DROP COLUMN IF EXISTS hiring_manager_name,
  DROP COLUMN IF EXISTS target_start_date,
  DROP COLUMN IF EXISTS language_requirements;
