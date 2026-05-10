import Link from "next/link";
import { hiring, type RoleRow, type ClientRow } from "@/lib/hiring";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HiringRolesPage() {
  const db = hiring();
  const { data: rolesData, error } = await db
    .from("roles")
    .select("*")
    .order("created_at", { ascending: false });

  const roles = (rolesData ?? []) as RoleRow[];
  const clientIds = Array.from(new Set(roles.map((r) => r.client_id)));
  const clientsById = new Map<string, ClientRow>();
  if (clientIds.length > 0) {
    const { data: clients } = await db
      .from("clients")
      .select("*")
      .in("id", clientIds);
    for (const c of (clients ?? []) as ClientRow[]) {
      clientsById.set(c.id, c);
    }
  }

  // Application counts per role.
  const counts = new Map<string, number>();
  if (roles.length > 0) {
    const { data: appRows } = await db
      .from("applications")
      .select("role_id")
      .in(
        "role_id",
        roles.map((r) => r.id),
      );
    for (const r of (appRows ?? []) as { role_id: string }[]) {
      counts.set(r.role_id, (counts.get(r.role_id) ?? 0) + 1);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Roles</h1>
          <p className="text-sm text-muted-foreground">
            Active and past hiring projects.
          </p>
        </div>
        <Link href="/admin/hiring/new" className={cn(buttonVariants())}>
          New role
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Failed to load: {error.message}</p>
      ) : null}

      {roles.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No roles yet. Create one to start.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Applications</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roles.map((r) => {
                const client = clientsById.get(r.client_id);
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/admin/hiring/${r.id}`}
                        className="hover:underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {client?.company_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {counts.get(r.id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
