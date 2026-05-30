import { notFound, redirect } from "next/navigation";
import { hiring, type JobRow } from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { FeeTermsCard } from "../settings/fee-terms-card";

export const dynamic = "force-dynamic";

/**
 * /jobs/[jobId]/terms — admin-only tab where the commercial terms
 * live. Used to be a card under /settings; promoted to its own tab
 * so the everyday create flow (/jobs/new) stays light and the
 * commercial setup has room to grow (fee model, retainers, splits,
 * referente, etc.). Recruiters get redirected to the vacante's
 * default landing page.
 */
export default async function JobTermsTab({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const t = await getT();
  const me = await getCurrentUser();
  const { jobId } = await params;
  if (me && !isAdmin(me.team_member)) {
    redirect(`/jobs/${jobId}`);
  }

  const db = await hiring();
  const { data } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) notFound();
  const job = data as JobRow;

  // Display labels for the two contact-pointer fields (sourcer +
  // referente) so the form rehydrates with names instead of bare
  // ids. Workspace-scoped via RLS.
  let sourcerLabel: string | null = null;
  let leadLabel: string | null = null;
  if (job.sourcer_contact_id) {
    const { data: c } = await db
      .from("contacts")
      .select("full_name")
      .eq("id", job.sourcer_contact_id)
      .maybeSingle();
    sourcerLabel = (c?.full_name as string | null) ?? null;
  }
  if (job.lead_contact_id) {
    const { data: c } = await db
      .from("contacts")
      .select("full_name")
      .eq("id", job.lead_contact_id)
      .maybeSingle();
    leadLabel = (c?.full_name as string | null) ?? null;
  } else if (job.lead_company_id) {
    const { data: c } = await db
      .from("companies")
      .select("name")
      .eq("id", job.lead_company_id)
      .maybeSingle();
    leadLabel = (c?.name as string | null) ?? null;
  }

  return (
    <div className="space-y-5 py-4">
      <Card>
        <CardContent>
          <h2 className="mb-1 text-base font-semibold">
            {t("jobSubtabs.commercialTermsTitle")}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("jobSubtabs.commercialTermsDesc")}
          </p>
          <FeeTermsCard
            job={job}
            sourcerLabel={sourcerLabel}
            leadLabel={leadLabel}
          />
        </CardContent>
      </Card>
    </div>
  );
}
