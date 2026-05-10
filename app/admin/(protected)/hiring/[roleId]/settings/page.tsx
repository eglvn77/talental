import { notFound } from "next/navigation";
import { hiring, type RoleRow } from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { RoleSettingsForm } from "./role-settings-form";
import { DeleteRoleZone } from "./delete-role-zone";

export const dynamic = "force-dynamic";

export default async function RoleSettingsTab({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const { data } = await hiring()
    .from("roles")
    .select("*")
    .eq("id", roleId)
    .maybeSingle();
  if (!data) notFound();
  const role = data as RoleRow;

  return (
    <div className="space-y-5 py-4">
      <Card>
        <CardContent>
          <h2 className="mb-1 text-base font-semibold">Role basics</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Title, location, salary range, and the public-facing description.
          </p>
          <RoleSettingsForm role={role} />
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardContent>
          <h2 className="mb-1 text-base font-semibold text-red-700">
            Danger zone
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Deleting a role removes its pipeline stages, applications, and audit
            log. Candidates remain in the talent pool.
          </p>
          <DeleteRoleZone roleId={role.id} title={role.title} />
        </CardContent>
      </Card>
    </div>
  );
}
