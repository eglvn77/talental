import { redirect } from "next/navigation";

export default async function RoleIndex({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  redirect(`/admin/hiring/${roleId}/tracking`);
}
