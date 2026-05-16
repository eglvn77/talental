import { getCurrentUser } from "@/lib/auth/session";

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) return null;
  return (
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
  );
}
