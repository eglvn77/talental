import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import {
  hiring,
  type CompanyRow,
  type JobRow,
  type CustomFieldDefinitionRow,
  type JobStatusRow,
} from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { loadCustomFieldsForList } from "@/lib/custom-fields";
import { loadJobStatuses } from "@/lib/job-status";
import { JobsTable } from "./jobs-table";
import { EmptyState } from "../_components/empty-state";
import { CreateJobButton } from "./create-job-button";
import { getT } from "@/lib/i18n/server";
import type { ProcessTemplateOption } from "./new/new-job-form";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const me = await getCurrentUser();
  const canCreate = me ? isAdmin(me.team_member) : false;
  const t = await getT();
  const workspaceSlug = me?.workspace.slug ?? "";
  const db = await hiring();

  // Server-load templates for the create-vacante modal so the
  // Proceso selector hydrates synchronously when ?create=1 fires.
  // Cheap query (handful of rows) so we run it unconditionally
  // rather than gating on canCreate.
  const { data: templatesData } = await db
    .from("process_templates")
    .select("id, name, is_default")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  const templates: ProcessTemplateOption[] = (templatesData ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    is_default: Boolean(t.is_default),
  }));

  // Job custom field definitions for the create modal — collected at
  // create time (deferred, batch-saved after the vacante exists).
  const { data: jobFieldDefs } = await db
    .from("custom_field_definitions")
    .select("*")
    .eq("entity_type", "job")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const customFieldDefs = (jobFieldDefs ?? []) as CustomFieldDefinitionRow[];

  const { data: jobsData, error } = await db
    .from("jobs")
    .select("*, status:job_statuses(*)")
    .order("created_at", { ascending: false });

  const jobs = (jobsData ?? []) as Array<
    JobRow & { status: JobStatusRow | null }
  >;
  const jobStatuses = await loadJobStatuses();

  // Hydrate company rows for the "Cliente" column + filter dropdown.
  const companyIds = Array.from(
    new Set(jobs.map((j) => j.company_id).filter((v): v is string => Boolean(v))),
  );
  const companiesById: Record<string, CompanyRow> = {};
  if (companyIds.length > 0) {
    const { data: companies } = await db
      .from("companies")
      .select("*")
      .in("id", companyIds);
    for (const c of (companies ?? []) as CompanyRow[]) {
      companiesById[c.id] = c;
    }
  }

  // Application counts per job — total + pending (unreviewed careers
  // submissions). Pending count drives the macOS-style red-dot badge
  // on the table; the partial index makes the second query trivial.
  const candidateCounts: Record<string, number> = {};
  const pendingCounts: Record<string, number> = {};
  if (jobs.length > 0) {
    const jobIds = jobs.map((j) => j.id);
    const [{ data: appRows }, { data: pendingRows }] = await Promise.all([
      db.from("applications").select("job_id").in("job_id", jobIds),
      db
        .from("applications")
        .select("job_id")
        .in("job_id", jobIds)
        .is("reviewed_at", null)
        .eq("source", "careers"),
    ]);
    for (const r of (appRows ?? []) as { job_id: string }[]) {
      candidateCounts[r.job_id] = (candidateCounts[r.job_id] ?? 0) + 1;
    }
    for (const r of (pendingRows ?? []) as { job_id: string }[]) {
      pendingCounts[r.job_id] = (pendingCounts[r.job_id] ?? 0) + 1;
    }
  }

  // Custom fields for every visible job. The table reads
  // `is_filterable` + `is_visible_in_columns` off each definition
  // to decide what to surface in <FiltersPopover> / the table head.
  const customFields = await loadCustomFieldsForList(
    "job",
    jobs.map((j) => j.id),
  );

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("jobs.title")}</h1>
        {/* Icon-only quick-create button — same shape as the per-
            job "Agregar candidatos" trigger: olive square, entity
            icon from the sidebar (Briefcase) with a tiny `+` badge
            tucked in the corner, tooltip says the full label on
            hover. Admin-only — recruiters can't create vacantes
            (they'd grant themselves access by being the assignee). */}
        {canCreate ? (
          <Link
            href="/jobs?create=1"
            scroll={false}
            aria-label={t("jobs.newJob")}
            title={t("jobs.newJob")}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-fg-on-accent transition-colors hover:bg-accent/90"
          >
            <Briefcase className="h-4 w-4" />
            <Plus
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent stroke-[3] ring-2 ring-bg-1"
              aria-hidden
            />
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-danger">{t("common.loadError", { message: error.message })}</p>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title={t("jobs.emptyTitle")}
          description={t("jobs.emptyDesc")}
          action={{ label: `+ ${t("jobs.newJob")}`, href: "/jobs?create=1" }}
        />
      ) : (
        <JobsTable
          jobs={jobs}
          jobStatuses={jobStatuses}
          companiesById={companiesById}
          candidateCounts={candidateCounts}
          pendingCounts={pendingCounts}
          customFields={customFields}
          workspaceSlug={workspaceSlug}
        />
      )}

      {/* URL-driven create modal — opens on `?create=1` from the
          page-header `+` button or the global "+ Crear" menu. */}
      <CreateJobButton templates={templates} customFieldDefs={customFieldDefs} />
    </main>
  );
}
