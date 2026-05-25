import { getCurrentUser } from "@/lib/auth/session";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { ProfileNameField } from "./profile-name-field";
import { ThemeToggle } from "./theme-toggle";

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) return null;
  return (
    <>
      <SettingsTabsServer />
      <div className="space-y-8">
        <section className="space-y-4">
          <dl className="grid grid-cols-[140px_1fr] items-center gap-y-3 text-sm">
            <dt className="text-muted-foreground">Nombre</dt>
            <dd>
              <ProfileNameField initialName={me.team_member.full_name} />
            </dd>
            <dt className="text-muted-foreground">Correo</dt>
            <dd>{me.email}</dd>
            <dt className="text-muted-foreground">Rol</dt>
            <dd className="capitalize">{me.team_member.team_role}</dd>
          </dl>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Apariencia</h2>
          <p className="text-xs text-muted-foreground">
            &quot;Sistema&quot; sigue la preferencia de tu sistema operativo.
          </p>
          <ThemeToggle />
        </section>
      </div>
    </>
  );
}
