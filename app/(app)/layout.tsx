import { Toaster } from "sonner";
import { signOutAction } from "@/app/login/actions";
import { AdminSidebar } from "./sidebar";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth is enforced upstream in proxy.ts (it validates the JWT against
  // Supabase and redirects to /login otherwise). Server components below
  // can rely on the cookie session; downstream `getCurrentUser` callers
  // still validate explicitly when they need user data.
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
      <Toaster position="bottom-right" theme="light" richColors closeButton />
    </div>
  );
}
