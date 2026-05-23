-- =====================================================
-- candidates.location: human-readable "City, Country" denorm field.
--
-- Both the CV parser (Gemini) and the LinkedIn enricher already return
-- location as a single string at the candidate level. The sourcing
-- migration added country + city columns but no aggregate `location`
-- — bug found via PostgREST 400 on the bulk-create endpoint.
-- =====================================================

ALTER TABLE hiring.candidates ADD COLUMN location text;

COMMENT ON COLUMN hiring.candidates.location IS
  'Human-readable location ("CDMX, México"). Denormalized for display + search; country/city stay alongside for granular filtering.';
