import { Toaster } from "sonner";
import { AdminSidebar } from "./sidebar";
import { SearchCommand } from "./_components/search-command";

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
      <a
        href="#main"
        className="sr-only-focusable fixed left-2 top-2 z-[100] rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background focus:not-sr-only"
      >
        Saltar al contenido
      </a>
      <AdminSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
      </div>
      <Toaster position="bottom-right" theme="light" richColors closeButton />
      <SearchCommand />
    </div>
  );
}
