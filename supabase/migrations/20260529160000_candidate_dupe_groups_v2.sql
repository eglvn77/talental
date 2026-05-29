-- ============================================================
-- candidate_duplicate_groups v2 — match on LinkedIn + public_id too.
--
-- v1 grouped only by normalized full_name, so it missed same-person
-- rows that share a LinkedIn profile but were typed with different
-- names (e.g. "Emanuel" via careers vs "Emanuel Galván" via LinkedIn
-- enrichment — same profile, undetected). v2 also groups by canonical
-- linkedin_url (protocol/www/trailing-slash-insensitive) and by
-- linkedin_public_id, emitting a `match_type` so the UI can label why a
-- pair was flagged. LinkedIn signals rank above name (stronger).
-- ============================================================

DROP FUNCTION IF EXISTS hiring.candidate_duplicate_groups(int);

CREATE FUNCTION hiring.candidate_duplicate_groups(
  p_limit int DEFAULT 100
)
RETURNS TABLE(match_type text, match_key text, n bigint, candidate_ids uuid[])
LANGUAGE sql
STABLE
SET search_path = hiring, public
AS $$
  WITH norm AS (
    SELECT
      id,
      created_at,
      nullif(
        trim(regexp_replace(
          translate(lower(full_name),
            'áàäâãéèëêíìïîóòöôõúùüûñç',
            'aaaaaeeeeiiiiooooouuuunc'),
          '\s+', ' ', 'g')),
        ''
      ) AS name_key,
      nullif(
        regexp_replace(
          regexp_replace(lower(linkedin_url), '^https?://(www\.)?', ''),
          '/+$', ''),
        ''
      ) AS li_key,
      nullif(lower(linkedin_public_id), '') AS pid_key
    FROM hiring.candidates
  ),
  by_li AS (
    SELECT 'linkedin'::text AS mt, li_key AS mk,
           count(*) AS n, array_agg(id ORDER BY created_at) AS ids
    FROM norm WHERE li_key IS NOT NULL GROUP BY li_key HAVING count(*) > 1
  ),
  by_pid AS (
    SELECT 'public_id'::text, pid_key,
           count(*), array_agg(id ORDER BY created_at)
    FROM norm WHERE pid_key IS NOT NULL GROUP BY pid_key HAVING count(*) > 1
  ),
  by_name AS (
    SELECT 'name'::text, name_key,
           count(*), array_agg(id ORDER BY created_at)
    FROM norm WHERE name_key IS NOT NULL GROUP BY name_key HAVING count(*) > 1
  )
  SELECT mt, mk, n, ids
  FROM (
    SELECT * FROM by_li
    UNION ALL SELECT * FROM by_pid
    UNION ALL SELECT * FROM by_name
  ) g
  ORDER BY n DESC, mt, mk
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION hiring.candidate_duplicate_groups(int) FROM anon;
GRANT EXECUTE ON FUNCTION hiring.candidate_duplicate_groups(int) TO authenticated, service_role;
