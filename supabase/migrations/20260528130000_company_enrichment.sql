-- Company enrichment via DataForB2B (domain-based, /search/companies).
--
-- Two surfaces, per the agreed plan:
--
--   1. hiring.company_enrichment — the audit/source-of-record row for
--      each (company, source). Holds the full raw_response, the
--      synthesized match_confidence, the status, and the runner-up
--      matches for manual review. One row per (company_id, source)
--      (upsert), NOT an append-only log — api_usage_log already
--      records every API call for cost/audit.
--
--   2. hiring.companies — materialized, queryable columns for the few
--      fields the UI filters on. industry / employee_count /
--      founded_year / company_type / funding_stage / total_funding_usd
--      already exist; this migration adds the three that don't yet:
--      employee_growth_6m, category, investors.
--
-- Multi-tenant: everything is workspace-scoped via RLS, same pattern
-- as the rest of hiring.*. Never crosses workspaces.
--
-- NOTE: match_confidence and alternative_matches are computed by the
-- app (exact-domain-match heuristic over the /search/companies
-- results) — DataForB2B does NOT return a relevance score.

-- ---------- 1. Materialized columns on companies ----------
ALTER TABLE hiring.companies
  ADD COLUMN IF NOT EXISTS employee_growth_6m numeric,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS investors jsonb;

-- ---------- 2. company_enrichment table ----------
CREATE TABLE IF NOT EXISTS hiring.company_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL
    REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  company_id uuid NOT NULL
    REFERENCES hiring.companies(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'dataforb2b',
  -- 'enriched'      — confident match, data materialized
  -- 'low_confidence'— match below threshold; good data NOT overwritten,
  --                   alternative_matches kept for manual review
  -- 'no_match'      — domain returned nothing; attempt recorded
  status text NOT NULL CHECK (status IN ('enriched', 'low_confidence', 'no_match')),
  match_confidence numeric CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  raw_response jsonb,
  -- Runner-up /search/companies results when the top match wasn't
  -- confident enough — surfaced in a manual-review UI later.
  alternative_matches jsonb,
  -- When the enrichment actually ran (success or attempt). Mirrors
  -- companies.enriched_at for the materialized row.
  enriched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One current enrichment per (company, source). Re-running upserts.
  UNIQUE (company_id, source)
);

-- Review queue lookups: "show low_confidence / no_match in this
-- workspace". Workspace-scoped + status-filtered.
CREATE INDEX IF NOT EXISTS company_enrichment_workspace_status_idx
  ON hiring.company_enrichment (workspace_id, status);

CREATE INDEX IF NOT EXISTS company_enrichment_company_idx
  ON hiring.company_enrichment (company_id);

-- ---------- 3. RLS ----------
ALTER TABLE hiring.company_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON hiring.company_enrichment
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_insert ON hiring.company_enrichment
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_update ON hiring.company_enrichment
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_delete ON hiring.company_enrichment
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

-- ---------- 4. GRANTs (per project convention — MCP/migration tables
-- don't auto-grant to service_role; the backfill script runs under it). ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.company_enrichment TO authenticated;
GRANT ALL ON hiring.company_enrichment TO service_role;
