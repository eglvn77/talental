import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { SettingsTabs } from "./settings-nav";

/**
 * Thin server wrapper around <SettingsTabs/>. Resolves the current
 * user's admin/owner flags once so every sub-section page can just
 * drop <SettingsTabsServer /> at the top without each having to
 * re-fetch the user. The client tab component itself stays minimal
 * (only needs pathname for the active highlight).
 */
export async function SettingsTabsServer() {
  const me = await getCurrentUser();
  const userIsAdmin = me ? isAdmin(me.team_member) : false;
  const isOwner = me?.team_member.team_role === "owner";
  return <SettingsTabs isAdmin={userIsAdmin} isOwner={isOwner} />;
}
