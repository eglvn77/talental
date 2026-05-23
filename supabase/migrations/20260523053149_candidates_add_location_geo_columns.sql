-- =====================================================
-- candidates: lat/lng/place_id for the location field.
-- Mirrors the jobs table pattern. Lets the candidate's freeform
-- "City, Country" promote to a real Google Places pick when the
-- recruiter selects from the autocomplete in the CV review wizard.
-- =====================================================

ALTER TABLE hiring.candidates
  ADD COLUMN location_lat double precision,
  ADD COLUMN location_lng double precision,
  ADD COLUMN location_place_id text;

COMMENT ON COLUMN hiring.candidates.location_place_id IS
  'Google Places place_id when the location was picked from the autocomplete (free-text values stay null here).';
