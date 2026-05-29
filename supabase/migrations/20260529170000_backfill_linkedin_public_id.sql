-- Backfill linkedin_public_id from linkedin_url where missing, so the
-- per-workspace unique index + dedup lookups recognize existing rows on
-- future imports. Collision-guarded: only set it when no other row in
-- the same workspace already owns that public_id (the genuine dupes are
-- left for the merge UI, which consolidates them).
UPDATE hiring.candidates c
SET linkedin_public_id = sub.pid
FROM (
  SELECT id, workspace_id,
         lower((regexp_match(linkedin_url, '/in/([^/?#]+)'))[1]) AS pid
  FROM hiring.candidates
  WHERE linkedin_url IS NOT NULL AND linkedin_public_id IS NULL
) sub
WHERE c.id = sub.id
  AND sub.pid IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM hiring.candidates other
    WHERE other.workspace_id = sub.workspace_id
      AND other.linkedin_public_id = sub.pid
  );
