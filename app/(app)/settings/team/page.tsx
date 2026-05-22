import { hiring, type TeamMemberRow } from "@/lib/hiring";

export default async function TeamPage() {
  const db = await hiring();
  const { data } = await db
    .from("team_members")
    .select("*")
    .order("created_at", { ascending: true });
  const members = (data ?? []) as TeamMemberRow[];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Equipo</h2>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nombre</th>
              <th className="px-3 py-2 text-left font-medium">Correo</th>
              <th className="px-3 py-2 text-left font-medium">Rol</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Aún no hay miembros.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">{m.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{m.email}</td>
                  <td className="px-3 py-2 capitalize">{m.team_role}</td>
                  <td className="px-3 py-2">
                    {m.is_active ? (
                      <span className="rounded bg-positive-soft px-1.5 py-0.5 text-[10px] font-medium text-positive">
                        Activo
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Inactivo
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Invitar y editar miembros viene pronto.
      </p>
    </section>
  );
}
