import { getCurrentUser } from "@/lib/auth/session";
import { SettingsNav } from "./_components/settings-nav";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();
  const isOwner = me?.team_member.team_role === "owner";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Configuración</h1>
      <div className="grid grid-cols-[200px_1fr] gap-8">
        <SettingsNav isOwner={isOwner} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
