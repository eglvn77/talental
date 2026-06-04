import { notFound } from "next/navigation";
import { hiring, type PortalTokenRow, type PortalSessionRow, type JobClientPortalSettingsRow } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { siteUrl } from "@/lib/site-url";
import { getT } from "@/lib/i18n/server";
import { JobPortalAdminClient } from "./portal-admin-client";

export const dynamic = "force-dynamic";

export default async function JobPortalAdminPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const me = await getCurrentUser();
  if (!me || !isAdmin(me.team_member)) return notFound();

  const t = await getT();
  const db = await hiring();
  const base = await siteUrl();

  const [{ data: job }, { data: settings }, { data: tokens }] =
    await Promise.all([
      db.from("jobs").select("id, title, company_id").eq("id", jobId).maybeSingle(),
      db
        .from("job_client_portal_settings")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle(),
      db
        .from("portal_tokens")
        .select("*")
        .eq("scope", "job")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false }),
    ]);

  if (!job) return notFound();

  const tokenRows = (tokens ?? []) as PortalTokenRow[];

  // Fan-in recent sessions per token for the activity column.
  const sessionsByToken: Record<string, PortalSessionRow[]> = {};
  if (tokenRows.length > 0) {
    const { data: sessions } = await db
      .from("portal_sessions")
      .select("*")
      .in("token_id", tokenRows.map((r) => r.id))
      .order("last_seen_at", { ascending: false })
      .limit(50);
    for (const s of (sessions ?? []) as PortalSessionRow[]) {
      (sessionsByToken[s.token_id] ??= []).push(s);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-6">
      <h1 className="text-lg font-semibold">{t("portal.adminTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("portal.adminJobIntro")}
      </p>

      <JobPortalAdminClient
        jobId={jobId}
        siteUrl={base}
        tokens={tokenRows}
        sessionsByToken={sessionsByToken}
        settings={(settings ?? null) as JobClientPortalSettingsRow | null}
      />
    </main>
  );
}
