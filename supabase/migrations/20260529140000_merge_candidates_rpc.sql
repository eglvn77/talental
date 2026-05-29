-- ============================================================
-- hiring.merge_candidates(primary, secondary, fields)
--
-- Atomically folds the `secondary` candidate into `primary`:
--   - repoints all child rows (applications, education, experience,
--     skills, conversations) and polymorphic refs (notes, entity_tags),
--     resolving the unique constraints that would otherwise block a
--     blind repoint;
--   - sets the survivor's user-pickable scalar fields to the values the
--     recruiter chose field-by-field (`p_fields` jsonb — the UI shows
--     both profiles side-by-side and the user picks each one);
--   - for the remaining non-pickable fields, fills the primary's EMPTY
--     ones from the secondary (COALESCE — never clobbers existing data);
--   - deletes the secondary.
--
-- `p_fields` keys (any subset; absent key = keep the primary's value):
--   full_name, email, phone, linkedin_url, headline, summary,
--   current_company_name, current_position, location, profile_picture_url,
--   resume_url. An empty-string value is treated as NULL.
--
-- SECURITY DEFINER so it can touch every child table in one transaction,
-- but it does its OWN authorization check first: the caller must be an
-- admin of the candidates' (shared) workspace. RLS is otherwise our
-- tenant guard; this function must never become a cross-tenant hole.
--
-- Destructive (the secondary row is deleted). The UI gates it behind an
-- explicit type-to-confirm dialog.
-- ============================================================

CREATE OR REPLACE FUNCTION hiring.merge_candidates(
  p_primary uuid,
  p_secondary uuid,
  p_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hiring, public
AS $$
DECLARE
  v_primary   hiring.candidates%ROWTYPE;
  v_secondary hiring.candidates%ROWTYPE;
BEGIN
  IF p_primary = p_secondary THEN
    RAISE EXCEPTION 'No se puede fusionar un candidato consigo mismo.';
  END IF;

  SELECT * INTO v_primary FROM hiring.candidates WHERE id = p_primary;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidato principal no encontrado.'; END IF;
  SELECT * INTO v_secondary FROM hiring.candidates WHERE id = p_secondary;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidato secundario no encontrado.'; END IF;

  IF v_primary.workspace_id <> v_secondary.workspace_id THEN
    RAISE EXCEPTION 'Los candidatos pertenecen a workspaces distintos.';
  END IF;

  -- Authorization: admin of the candidates' workspace (the SECURITY
  -- DEFINER context bypasses RLS, so this check is the tenant guard).
  IF v_primary.workspace_id NOT IN (SELECT hiring.user_workspace_ids())
     OR NOT hiring.is_workspace_admin() THEN
    RAISE EXCEPTION 'No autorizado para fusionar candidatos en este workspace.';
  END IF;

  -- applications: unique (candidate_id, job_id). Drop the secondary's
  -- applications to jobs the primary already sits in (keep the primary's
  -- richer pipeline state), then repoint the rest.
  DELETE FROM hiring.applications a
   WHERE a.candidate_id = p_secondary
     AND a.job_id IN (
       SELECT job_id FROM hiring.applications WHERE candidate_id = p_primary
     );
  UPDATE hiring.applications SET candidate_id = p_primary
   WHERE candidate_id = p_secondary;

  -- skills: unique (candidate_id, skill). Dedup on skill, then repoint.
  DELETE FROM hiring.candidate_skills s
   WHERE s.candidate_id = p_secondary
     AND s.skill IN (
       SELECT skill FROM hiring.candidate_skills WHERE candidate_id = p_primary
     );
  UPDATE hiring.candidate_skills SET candidate_id = p_primary
   WHERE candidate_id = p_secondary;

  -- education / experience: no per-candidate unique key — repoint all.
  UPDATE hiring.candidate_education SET candidate_id = p_primary
   WHERE candidate_id = p_secondary;
  UPDATE hiring.candidate_experience SET candidate_id = p_primary
   WHERE candidate_id = p_secondary;

  -- conversations: repoint.
  UPDATE hiring.conversations SET candidate_id = p_primary
   WHERE candidate_id = p_secondary;

  -- notes (polymorphic by entity_type/entity_id): repoint.
  UPDATE hiring.notes SET entity_id = p_primary
   WHERE entity_type = 'candidate' AND entity_id = p_secondary;

  -- entity_tags: PK (tag_id, entity_type, entity_id). Dedup on tag_id,
  -- then repoint the remaining tags.
  DELETE FROM hiring.entity_tags t
   WHERE t.entity_type = 'candidate' AND t.entity_id = p_secondary
     AND t.tag_id IN (
       SELECT tag_id FROM hiring.entity_tags
        WHERE entity_type = 'candidate' AND entity_id = p_primary
     );
  UPDATE hiring.entity_tags SET entity_id = p_primary
   WHERE entity_type = 'candidate' AND entity_id = p_secondary;

  -- Delete the secondary FIRST so its unique email / linkedin values are
  -- freed before we copy them onto the primary (otherwise the two rows
  -- would momentarily collide on the per-workspace unique indexes).
  DELETE FROM hiring.candidates WHERE id = p_secondary;

  -- Apply the survivor's fields.
  --   * USER-PICKABLE fields: take the value the recruiter chose in the
  --     side-by-side UI (p_fields). Absent key → keep the primary's
  --     current value; empty string → NULL.
  --   * NON-pickable fields: COALESCE-fill the primary's empties from the
  --     secondary (never clobber existing primary data).
  UPDATE hiring.candidates p SET
    full_name = CASE WHEN p_fields ? 'full_name'
                     THEN COALESCE(NULLIF(p_fields ->> 'full_name', ''), p.full_name)
                     ELSE p.full_name END,
    email = CASE WHEN p_fields ? 'email'
                 THEN NULLIF(p_fields ->> 'email', '') ELSE p.email END,
    phone = CASE WHEN p_fields ? 'phone'
                 THEN NULLIF(p_fields ->> 'phone', '') ELSE p.phone END,
    linkedin_url = CASE WHEN p_fields ? 'linkedin_url'
                        THEN NULLIF(p_fields ->> 'linkedin_url', '') ELSE p.linkedin_url END,
    headline = CASE WHEN p_fields ? 'headline'
                    THEN NULLIF(p_fields ->> 'headline', '') ELSE p.headline END,
    summary = CASE WHEN p_fields ? 'summary'
                   THEN NULLIF(p_fields ->> 'summary', '') ELSE p.summary END,
    current_company_name = CASE WHEN p_fields ? 'current_company_name'
                                THEN NULLIF(p_fields ->> 'current_company_name', '') ELSE p.current_company_name END,
    current_position = CASE WHEN p_fields ? 'current_position'
                            THEN NULLIF(p_fields ->> 'current_position', '') ELSE p.current_position END,
    location = CASE WHEN p_fields ? 'location'
                    THEN NULLIF(p_fields ->> 'location', '') ELSE p.location END,
    profile_picture_url = CASE WHEN p_fields ? 'profile_picture_url'
                               THEN NULLIF(p_fields ->> 'profile_picture_url', '') ELSE p.profile_picture_url END,
    resume_url = CASE WHEN p_fields ? 'resume_url'
                      THEN NULLIF(p_fields ->> 'resume_url', '') ELSE p.resume_url END,
    -- Non-pickable: auto-fill empties from the secondary.
    linkedin_public_id   = COALESCE(p.linkedin_public_id, v_secondary.linkedin_public_id),
    resume_text          = COALESCE(p.resume_text, v_secondary.resume_text),
    parsed_profile       = COALESCE(p.parsed_profile, v_secondary.parsed_profile),
    first_name           = COALESCE(p.first_name, v_secondary.first_name),
    last_name            = COALESCE(p.last_name, v_secondary.last_name),
    country              = COALESCE(p.country, v_secondary.country),
    city                 = COALESCE(p.city, v_secondary.city),
    years_of_experience  = COALESCE(p.years_of_experience, v_secondary.years_of_experience),
    location_lat         = COALESCE(p.location_lat, v_secondary.location_lat),
    location_lng         = COALESCE(p.location_lng, v_secondary.location_lng),
    location_place_id    = COALESCE(p.location_place_id, v_secondary.location_place_id),
    needs_embedding      = true,
    updated_at           = now()
  WHERE p.id = p_primary;
END;
$$;

REVOKE EXECUTE ON FUNCTION hiring.merge_candidates(uuid, uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION hiring.merge_candidates(uuid, uuid, jsonb) TO authenticated, service_role;
