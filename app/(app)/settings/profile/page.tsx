import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { AvatarUploader } from "./avatar-uploader";
import { ProfileNameField } from "./profile-name-field";
import { ThemeToggle } from "./theme-toggle";

const ROLE_KEY: Record<string, string> = {
  owner: "profile.roleOwner",
  admin: "profile.roleAdmin",
  recruiter: "profile.roleRecruiter",
};

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) return null;
  const t = await getT();
  const roleKey = ROLE_KEY[me.team_member.team_role];
  return (
    <>
      <SettingsTabsServer />
      <div className="space-y-8">
        <section className="space-y-4">
          <AvatarUploader
            initialUrl={me.team_member.avatar_url}
            name={me.team_member.full_name}
          />
          <dl className="grid grid-cols-[140px_1fr] items-center gap-y-3 text-sm">
            <dt className="text-muted-foreground">{t("profile.name")}</dt>
            <dd>
              <ProfileNameField initialName={me.team_member.full_name} />
            </dd>
            <dt className="text-muted-foreground">{t("profile.email")}</dt>
            <dd>{me.email}</dd>
            <dt className="text-muted-foreground">{t("profile.role")}</dt>
            <dd className={roleKey ? undefined : "capitalize"}>
              {roleKey ? t(roleKey) : me.team_member.team_role}
            </dd>
          </dl>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("profile.appearance")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("profile.appearanceHint")}
          </p>
          <ThemeToggle />
        </section>
      </div>
    </>
  );
}
