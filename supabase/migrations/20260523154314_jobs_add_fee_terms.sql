-- =====================================================
-- hiring.jobs — commercial fee terms captured at opening.
--
-- Replaces the external Google-Sheet tracker that's been holding
-- fee model, retainer policy, midpoint, and revenue splits per
-- vacante. Everything now lives on the job row so the ATS is
-- the source of truth.
--
-- Notes:
--   • salary_min / salary_max / salary_currency / salary_frequency
--     already exist on the table. They drive the midpoint, which
--     is computed in the UI from these fields (not stored).
--   • fee_pct / fee_currency / monthly_retainer /
--     placement_revenue_estimated already exist. We're keeping
--     fee_pct as the canonical "% of annual" and adding
--     `fee_months` so the user can input either side; both are
--     stored so the form can rehydrate either control.
--   • monthly_retainer stays unused (legacy). We add
--     `retainer_pct` because the new tracker drives off a
--     percentage of total fees, not a monthly amount.
--   • Lead/referral commission: ONE recipient per job, modeled
--     as (contact OR company) + % of revenue. The CHECK enforces
--     mutual exclusivity. If we ever need multiple recipients per
--     job we'll graduate to a separate job_revenue_splits table.
-- =====================================================

ALTER TABLE hiring.jobs
  ADD COLUMN fee_model text
    CHECK (fee_model IN ('retained', 'contingent')),
  ADD COLUMN billing_format text
    CHECK (billing_format IN ('invoice', 'factura')),
  ADD COLUMN fee_months numeric(5, 2),
  ADD COLUMN retainer_pct numeric(5, 2),
  ADD COLUMN recruiter_split_pct numeric(5, 2),
  ADD COLUMN lead_contact_id uuid
    REFERENCES hiring.contacts(id) ON DELETE SET NULL,
  ADD COLUMN lead_company_id uuid
    REFERENCES hiring.companies(id) ON DELETE SET NULL,
  ADD COLUMN lead_split_pct numeric(5, 2),
  ADD CONSTRAINT jobs_lead_recipient_exclusive
    CHECK (
      lead_contact_id IS NULL OR lead_company_id IS NULL
    );

-- Hot lookups: jobs filtered by lead recipient (reports view).
CREATE INDEX IF NOT EXISTS jobs_lead_contact_idx
  ON hiring.jobs (lead_contact_id)
  WHERE lead_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_lead_company_idx
  ON hiring.jobs (lead_company_id)
  WHERE lead_company_id IS NOT NULL;
