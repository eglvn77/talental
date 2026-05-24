-- =====================================================
-- hiring.jobs.retainer_pct — bump precision to 4 decimals.
--
-- Why: when the user types an anticipo $ amount directly, the UI
-- back-computes the % as (amount × 100 / total_fee). For typical
-- amount/totalFee pairs this lands on a non-round number (e.g.
-- 31.2891%). At numeric(5, 2) Postgres truncated the value to two
-- decimals (31.29), so the next reload would recompute the amount
-- to 24,299 instead of the 24,300 the user originally typed.
-- numeric(7, 4) preserves four decimal places — enough for the
-- user-typed $ amount to round-trip exactly through the percent.
--
-- Other pct columns (fee_pct, recruiter_split_pct, lead_split_pct)
-- stay at numeric(5, 2) because the user types those as percentages
-- directly, so two decimals is plenty.
-- =====================================================

ALTER TABLE hiring.jobs
  ALTER COLUMN retainer_pct TYPE numeric(7, 4);
