import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { BrandingForm } from "./branding-form";
import { CareersPreview } from "./preview";

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
  const t = await getT();
  const db = await hiring();
  const { data: wsRow } = await db
    .from("workspaces")
    .select(
      "logo_url, logo_url_dark, accent_color, careers_tagline, careers_theme",
    )
    .eq("id", user.workspace.id)
    .maybeSingle();
  const branding = (wsRow ?? {}) as {
    logo_url?: string | null;
    logo_url_dark?: string | null;
    accent_color?: string | null;
    careers_tagline?: string | null;
    careers_theme?: "light" | "dark" | "system";
  };

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              {t("careersCfg.publicSiteBrandingHeading")}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {t("careersCfg.publicSiteBrandingDescPrefix")}{" "}
              <code className="font-mono">
                app.talental.mx/careers/{user.workspace.slug}
              </code>
              .
            </p>
          </div>
          <a
            href={`/careers/${user.workspace.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-bg-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("careersCfg.viewSite")}
          </a>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <BrandingForm
            initialLogoUrl={branding.logo_url ?? null}
            initialLogoUrlDark={branding.logo_url_dark ?? null}
            initialAccentColor={branding.accent_color ?? null}
            initialCareersTagline={branding.careers_tagline ?? null}
            initialCareersTheme={branding.careers_theme ?? "light"}
          />
          <CareersPreview href={`/careers/${user.workspace.slug}`} />
        </div>
      </section>
    </>
  );
}
