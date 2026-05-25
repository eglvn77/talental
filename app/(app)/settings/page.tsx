import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { SettingsTileGrid } from "./_components/settings-tile-grid";

export const dynamic = "force-dynamic";

export default async function SettingsIndex() {
  const me = await getCurrentUser();
  const userIsAdmin = me ? isAdmin(me.team_member) : false;
  const isOwner = me?.team_member.team_role === "owner";

  return <SettingsTileGrid isAdmin={userIsAdmin} isOwner={isOwner} />;
}
