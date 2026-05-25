import { redirect } from "next/navigation";
import { hiring, type TeamMemberRow } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { InviteMemberForm } from "./invite-form";
import { TeamMemberRowActions } from "./row-actions";
import { WorkspaceNameField } from "./workspace-name-field";

export const dynamic = "force-dynamic";

/**
 * Workspace team management. Admin-only — recruiters get bounced
 * back to /settings since they can't see other members' roles.
 *
 * Lists every team_member in the workspace (active + inactive), lets
 * admins invite new ones, change roles, and deactivate / reactivate.
 * The owner row is read-only here; ownership transfer is a separate
 * (unbuilt) flow.
 */
export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.team_member)) {
    redirect("/settings");
  }

  const db = await hiring();
  const { data } = await db
    .from("team_members")
    .select("*")
    .order("is_active", { ascending: false })
    .order("team_role", { ascending: true })
    .order("created_at", { ascending: true });
  const members = (data ?? []) as TeamMemberRow[];

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-6">
        <WorkspaceNameField initialName={user.workspace.name} />

        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Miembros del workspace. Recruiters solo ven las vacantes a las
            que están asignados; admins ven todo.
          </p>
          <InviteMemberForm />
        </div>

        <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nombre</th>
              <th className="px-3 py-2 text-left font-medium">Correo</th>
              <th className="px-3 py-2 text-left font-medium">Rol</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Aún no hay miembros.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">
                    {m.full_name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{m.email}</td>
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
                  <td className="px-3 py-2">
                    <TeamMemberRowActions
                      memberId={m.id}
                      currentRole={m.team_role}
                      isActive={m.is_active}
                      isSelf={m.id === user.team_member.id}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </section>
    </>
  );
}
