import { getCurrentUser } from "@/lib/auth/session";
import { ThemeToggle } from "./theme-toggle";

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) return null;
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Mi perfil</h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Nombre</dt>
          <dd>{me.team_member.full_name ?? "—"}</dd>
          <dt className="text-muted-foreground">Correo</dt>
          <dd>{me.email}</dd>
          <dt className="text-muted-foreground">Rol</dt>
          <dd className="capitalize">{me.team_member.team_role}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          La edición del perfil viene pronto.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Apariencia</h2>
        <p className="text-xs text-muted-foreground">
          &quot;Sistema&quot; sigue la preferencia de tu sistema operativo.
        </p>
        <ThemeToggle />
      </section>
    </div>
  );
}
