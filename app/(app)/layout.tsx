import { Toaster } from "sonner";
import { AdminSidebar } from "./sidebar";
import { SearchCommand } from "./_components/search-command";
import { TopBar } from "./_components/top-bar";
import { GlobalSlideoverHost } from "./_components/global-slideover-host";
import { AddCandidatesHost } from "./_components/add-candidates-host";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getLocale, getT } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve admin status once at the layout level so the TopBar's
  // create menu can gate "Nueva vacante" without each child page
  // having to re-fetch the team_member row. getCurrentUser is React-
  // cached so this doesn't double-query.
  const currentUser = await getCurrentUser();
  const userIsAdmin = currentUser ? isAdmin(currentUser.team_member) : false;
  const locale = await getLocale();
  const t = await getT();
  // Auth is enforced upstream in proxy.ts (it validates the JWT against
  // Supabase and redirects to /login otherwise). Server components below
  // can rely on the cookie session; downstream `getCurrentUser` callers
  // still validate explicitly when they need user data.
  //
  // Layout shell:
  //   ┌──────────────────────────────────────────┐
  //   │  TopBar (brand + toggle + search)        │  ← sticky, full-width
  //   ├──────────┬───────────────────────────────┤
  //   │ Sidebar  │  main content                  │
  //   │ (nav)    │                                │
  //   └──────────┴───────────────────────────────┘
  // The TopBar carries the global search (Cmd+K trigger) so the rail
  // can stay pure-navigation. Sidebar sticks below the bar.
  return (
    <LocaleProvider locale={locale}>
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only-focusable fixed left-2 top-2 z-[100] rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background focus:not-sr-only"
      >
        {t("common.skipToContent")}
      </a>
      <TopBar isAdmin={userIsAdmin} />
      <div className="flex min-h-0 flex-1">
        <AdminSidebar
          user={
            currentUser
              ? {
                  name: currentUser.team_member.full_name,
                  email: currentUser.email,
                  workspaceName: currentUser.workspace.name,
                  avatarUrl: currentUser.team_member.avatar_url,
                }
              : null
          }
        />
        {/* min-w-0 lets flex children inside <main> actually shrink —
            without it, any wide inner content (tables, sourcing
            columns, the job tabs strip) forces the whole page to
            scroll horizontally and the sidebar gets pushed off-screen
            on mobile. Pair with overflow-x-hidden so any rogue
            overflow is contained inside the main column rather than
            escaping to the body. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
        </div>
      </div>
      <Toaster position="bottom-right" theme="light" richColors closeButton />
      <SearchCommand />
      {/* App-wide host for cross-route slideovers (currently company).
          Listens to ?company=<id> and overlays the profile without
          navigating away from the current page. */}
      <GlobalSlideoverHost />
      {/* App-wide "add candidates" flow — one method picker + dialogs
          for every entry point. Listens to ?addCandidates=1 (+ ?job). */}
      <AddCandidatesHost />
    </div>
    </LocaleProvider>
  );
}
