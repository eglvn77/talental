-- =====================================================
-- Auto-link team_members to auth.users on signup
--
-- `inviteTeamMemberAction` pre-links auth_user_id at invite time
-- (it knows the new auth.users id immediately from the
-- `auth.admin.inviteUserByEmail` response). This trigger is the
-- belt-and-suspenders backup for edge cases where a team_member
-- row exists without auth_user_id yet:
--
--   * Pre-existing rows seeded outside the invite flow
--   * Manual re-creation of an auth user after deletion
--   * Future SSO / OIDC paths that side-step the invite flow
--
-- When auth.users gets a new row, we look for any active
-- team_members entry with a matching (lowercase) email but no
-- auth_user_id and stamp it. Idempotent — if the row already
-- has auth_user_id set we leave it alone.
-- =====================================================

CREATE OR REPLACE FUNCTION hiring.link_team_member_on_auth_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE hiring.team_members
    SET auth_user_id = NEW.id
    WHERE auth_user_id IS NULL
      AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

-- Drop the old trigger if a previous migration created one with
-- the same name; idempotent reruns.
DROP TRIGGER IF EXISTS team_members_link_on_auth_create ON auth.users;

CREATE TRIGGER team_members_link_on_auth_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION hiring.link_team_member_on_auth_create();

GRANT EXECUTE ON FUNCTION hiring.link_team_member_on_auth_create()
  TO authenticated, service_role;
