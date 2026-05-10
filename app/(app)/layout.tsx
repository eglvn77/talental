import { requireSession } from "@/lib/auth/session";
import { signOutAction } from "@/app/login/actions";
import { AdminSidebar } from "./sidebar";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Belt-and-suspenders: the proxy already redirects unauthenticated users,
  // but we re-check here so server components downstream can rely on a
  // session being present.
  await requireSession();

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-12 items-center justify-end border-b border-border px-6">
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Cerrar sesión
            </button>
          </form>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
