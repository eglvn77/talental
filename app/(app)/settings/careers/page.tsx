import { redirect } from "next/navigation";
import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { BrandingForm } from "./branding-form";

export const dynamic = "force-dynamic";

/**
 * Settings → Página de carreras. Admin-only.
 *
 * Single home for everything that shapes the public careers site:
 *   - Logo (free aspect ratio, stored in the avatars bucket)
 *   - Accent color (hex, painted on the careers header stripe)
 *   - Tagline (free-text line under the workspace mark)
 *   - Theme (light / dark / system) — independent from the ATS theme
 *
 * The fields used to live on /settings/team alongside member
 * management, but careers branding is its own concern with enough
 * surface area to deserve a dedicated tab.
 */
export default async function CareersSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.team_member)) {
    redirect("/settings");
  }

  // workspace row carries the branding columns. Auth cache doesn't
  // include them, so re-fetch via the schema-scoped client. RLS is
  // fine — admins can read their own workspace.
  const db = await hiring();
  const { data: wsRow } = await db
    .from("workspaces")
    .select("logo_url, accent_color, careers_tagline, careers_theme")
    .eq("id", user.workspace.id)
    .maybeSingle();
  const branding = (wsRow ?? {}) as {
    logo_url?: string | null;
    accent_color?: string | null;
    careers_tagline?: string | null;
    careers_theme?: "light" | "dark" | "system";
  };

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">
            Branding del sitio público
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Lo que ven los candidatos en{" "}
            <code className="font-mono">
              app.talental.mx/careers/{user.workspace.slug}
            </code>
            .
          </p>
        </div>
        <BrandingForm
          initialLogoUrl={branding.logo_url ?? null}
          initialAccentColor={branding.accent_color ?? null}
          initialCareersTagline={branding.careers_tagline ?? null}
          initialCareersTheme={branding.careers_theme ?? "light"}
        />
      </section>
    </>
  );
}
