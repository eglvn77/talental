-- ============================================================
-- hiring.candidate_duplicate_groups(limit)
--
-- Read-only detector for likely-duplicate candidates. Exact email /
-- linkedin dupes are already impossible (per-workspace unique indexes),
-- so the realistic dupes are same-person rows with no/different email —
-- caught here by a normalized full_name match.
--
-- SECURITY INVOKER (default): RLS on candidates scopes every row to the
-- caller's workspace, so this can never leak cross-tenant.
--
-- Normalization: lowercase, fold common Spanish accents (no unaccent
-- extension needed), collapse whitespace. Returns one row per name that
-- has 2+ candidates, with their ids (oldest first) — the UI loads the
-- pair details and offers a field-by-field merge.
-- ============================================================

CREATE OR REPLACE FUNCTION hiring.candidate_duplicate_groups(
  p_limit int DEFAULT 100
)
RETURNS TABLE(match_key text, n bigint, candidate_ids uuid[])
LANGUAGE sql
STABLE
SET search_path = hiring, public
AS $$
  SELECT nkey AS match_key,
         count(*) AS n,
         array_agg(id ORDER BY created_at) AS candidate_ids
  FROM (
    SELECT id, created_at,
      nullif(
        trim(regexp_replace(
          translate(
            lower(full_name),
            'áàäâãéèëêíìïîóòöôõúùüûñç',
            'aaaaaeeeeiiiiooooouuuunc'
          ),
          '\s+', ' ', 'g'
        )),
        ''
      ) AS nkey
    FROM hiring.candidates
    WHERE full_name IS NOT NULL
  ) x
  WHERE nkey IS NOT NULL
  GROUP BY nkey
  HAVING count(*) > 1
  ORDER BY count(*) DESC, nkey
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION hiring.candidate_duplicate_groups(int) FROM anon;
GRANT EXECUTE ON FUNCTION hiring.candidate_duplicate_groups(int) TO authenticated, service_role;
