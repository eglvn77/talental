-- Per-workspace label + color overrides for the four fixed company
-- statuses (none / prospect / client / partner). The status itself
-- stays a Postgres enum — we are NOT making it add/delete-able, only
-- letting the admin rename the display label and pick a color.
--
-- Stored as a single JSONB column on workspaces so we avoid a whole
-- table + RLS + per-workspace seed. Shape:
--   {
--     "client":   { "label": "Cliente",   "color": "#547030" },
--     "prospect": { "label": "Prospecto", "color": "#b87333" },
--     ...
--   }
-- NULL / missing keys fall back to the hard-coded defaults in the
-- app, so existing workspaces keep working with zero data.

ALTER TABLE hiring.workspaces
  ADD COLUMN IF NOT EXISTS company_status_config jsonb;
