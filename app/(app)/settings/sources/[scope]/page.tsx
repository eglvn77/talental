import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { loadSources, type SourceScope } from "@/lib/sources";
import { SettingsTabsServer } from "../../_components/settings-tabs-server";
import { SourcesList } from "../sources-list";

export const dynamic = "force-dynamic";

function isScope(v: string): v is SourceScope {
  return v === "candidate" || v === "company";
}

export default async function SourcesSettingsPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");
  const { scope } = await params;
  if (!isScope(scope)) notFound();
  const t = await getT();
  const sources = await loadSources(scope);
  // Candidate sources can be turned into careers tracking links
  // (?src=<key>); pass the workspace slug so the list can build them.
  const careersSlug = scope === "candidate" ? me?.workspace.slug ?? null : null;

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">
            {scope === "candidate"
              ? t("sourcesCfg.candidateHeading")
              : t("sourcesCfg.companyHeading")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("sourcesCfg.description")}
          </p>
        </div>
        {careersSlug ? (
          <p className="text-xs text-muted-foreground">
            {t("sourcesCfg.trackingHint")}
          </p>
        ) : null}
        <SourcesList
          scope={scope}
          initialSources={sources}
          careersSlug={careersSlug}
        />
      </section>
    </>
  );
}
