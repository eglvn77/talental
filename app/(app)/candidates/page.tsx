import Link from "next/link";
import { Sparkles, Copy } from "lucide-react";
import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { loadCustomFieldsForList } from "@/lib/custom-fields";
import { Suspense } from "react";
import { CandidatesTable, type CandidateListRow } from "./candidates-table";
import { EmptyState } from "../_components/empty-state";
import { PageContainer, PageHeader } from "../_components/page-shell";
import {
  CandidatePanelAsync,
  CandidatePanelSkeleton,
} from "./candidate-panel-async";
import { parseTab } from "./candidate-profile-view";
import { AddCandidateMenu } from "../jobs/[jobId]/add-candidate-menu";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const MAX_RECENT_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    recent?: string;
    candidate?: string;
    tab?: string;
    page?: string;
    per?: string;
    q?: string;
    source?: string;
    company?: string;
    location?: string;
    enrichment?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const recentIds = parseRecentIds(params.recent);
  const slideoverId =
    params.candidate && UUID_RE.test(params.candidate)
      ? params.candidate
      : null;
  const slideoverTab = parseTab(params.tab);

  // Server-side pagination + filters + sort. URL params (page, per,
  // q, source, sort, dir) drive both this query and the count query.
  // Defaults match the TablePagination component (per=25, sort=
  // updated_at desc).
  const db = await hiring();
  const PER_PAGE_OPTIONS = new Set([25, 50, 100, 200]);
  const perRaw = Number(params.per ?? 25);
  const per = PER_PAGE_OPTIONS.has(perRaw) ? perRaw : 25;
  const pageRaw = Number(params.page ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const q = (params.q ?? "").trim();
  const sourceIds = (params.source ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const companyValues = (params.company ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const locationValues = (params.location ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Enrichment buckets — UI exposes 3 chips; map to SQL predicates:
  //   ok      → enrichment_status = 'coresignal_ok'
  //   failed  → enrichment_status LIKE 'coresignal_err_%'
  //   none    → enrichment_status IS NULL
  const enrichmentBuckets = (params.enrichment ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s === "ok" || s === "failed" || s === "none");

  // Sort whitelist — anything not on this list falls back to
  // updated_at desc. Server-side sort is necessary so pagination is
  // meaningful (page 2 must come after page 1 in the same order).
  const SORT_COLUMNS: Record<string, string> = {
    name: "full_name",
    email: "email",
    source: "default_source",
    position: "current_position",
    company: "current_company_name",
    location: "location",
    created: "created_at",
    updated: "updated_at",
  };
  const sortKey = params.sort && SORT_COLUMNS[params.sort] ? params.sort : "updated";
  const sortCol = SORT_COLUMNS[sortKey];
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const offset = (page - 1) * per;
  const safeQ = q.replace(/[%_,()]/g, "");
  const orFilter = safeQ
    ? `full_name.ilike.%${safeQ}%,email.ilike.%${safeQ}%,linkedin_url.ilike.%${safeQ}%`
    : null;

  // Enrichment OR-clause shared by data + count queries (3 buckets
  // selectable; UI exposes ok / failed / none). Empty array = no
  // enrichment filter applied. PostgREST `or` takes a comma-joined
  // condition string.
  const enrichmentConds: string[] = [];
  if (enrichmentBuckets.includes("ok")) enrichmentConds.push("enrichment_status.eq.coresignal_ok");
  if (enrichmentBuckets.includes("failed")) enrichmentConds.push("enrichment_status.like.coresignal_err_%");
  if (enrichmentBuckets.includes("none")) enrichmentConds.push("enrichment_status.is.null");
  const enrichmentOr = enrichmentConds.length > 0 ? enrichmentConds.join(",") : null;

  // Data query — server-side filtered + sorted + paged.
  // Extra cols (current_position, current_company_name, location,
  // enrichment_status) drive the new toggleable columns in the table.
  let dataQ = db
    .from("candidates")
    .select(
      `
      id, full_name, email, phone, linkedin_url, resume_url,
      default_source, created_at,
      current_position, current_company_name, location, enrichment_status,
      applications:applications(
        id, job_id, applied_at, status_changed_at,
        job:jobs(id, title)
      )
      `,
    )
    .is("linked_contact_id", null);
  if (orFilter) dataQ = dataQ.or(orFilter);
  if (sourceIds.length > 0) dataQ = dataQ.in("default_source", sourceIds);
  if (companyValues.length > 0) dataQ = dataQ.in("current_company_name", companyValues);
  if (locationValues.length > 0) dataQ = dataQ.in("location", locationValues);
  if (enrichmentOr) dataQ = dataQ.or(enrichmentOr);
  const candidatesQuery = dataQ
    .order(sortCol, { ascending: sortDir === "asc" })
    .range(offset, offset + per - 1);

  // Count query — same filters, head:true so PostgREST skips row data.
  let countQ = db
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .is("linked_contact_id", null);
  if (orFilter) countQ = countQ.or(orFilter);
  if (sourceIds.length > 0) countQ = countQ.in("default_source", sourceIds);
  if (companyValues.length > 0) countQ = countQ.in("current_company_name", companyValues);
  if (locationValues.length > 0) countQ = countQ.in("location", locationValues);
  if (enrichmentOr) countQ = countQ.or(enrichmentOr);
  const countQuery = countQ;

  // Options queries — distinct companies + locations across the
  // workspace's candidates. Capped at 2000 raw rows (then deduped +
  // counted in JS) so a workspace with 50k+ candidates doesn't blow
  // up the payload. Top 200 by frequency get rendered in the filter
  // popover. NULL/empty values are skipped.
  const companyOptionsQuery = db
    .from("candidates")
    .select("current_company_name")
    .is("linked_contact_id", null)
    .not("current_company_name", "is", null)
    .neq("current_company_name", "")
    .limit(2000);
  const locationOptionsQuery = db
    .from("candidates")
    .select("location")
    .is("linked_contact_id", null)
    .not("location", "is", null)
    .neq("location", "")
    .limit(2000);

  // Talent pool: every candidate in the workspace + their applications
  // with the job title for context. The client-side filter/sort +
  // 100-row "Load more" chunks below keeps render cost flat regardless
  // of total row count.
  //
  // The `?recent=<ids>` query param no longer filters the list (that
  // hid existing candidates and surprised users). Instead, we pass the
  // ids to the table for a "Nuevo" pill on those rows. Default sort
  // is created_at desc so the just-imported ones already float on top.
  // Slideover content streams in via Suspense — see CandidatePanelAsync.
  // The main page render no longer waits for loadCandidateView, which
  // was contributing 1-2 s of perceived latency on every navigation
  // into ?candidate=<id>.
  const [me, { data, error }, countRes, companyOptsRes, locationOptsRes] =
    await Promise.all([
      getCurrentUser(),
      candidatesQuery,
      countQuery,
      companyOptionsQuery,
      locationOptionsQuery,
    ]);
  const userIsAdmin = me ? isAdmin(me.team_member) : false;
  const t = await getT();
  const total = countRes.count ?? 0;

  // Dedupe + count company/location values, keep top 200 by frequency.
  const companyOptions = topByFrequency(
    (companyOptsRes.data ?? []).map(
      (r) => (r as { current_company_name: string | null }).current_company_name,
    ),
    200,
  );
  const locationOptions = topByFrequency(
    (locationOptsRes.data ?? []).map(
      (r) => (r as { location: string | null }).location,
    ),
    200,
  );

  const candidates = ((data ?? []) as CandidateListRow[]).map((c) => ({
    ...c,
    applications: (c.applications ?? []).slice().sort((a, b) =>
      (b.applied_at ?? "").localeCompare(a.applied_at ?? ""),
    ),
  }));

  return (
    <PageContainer>
      <PageHeader
        title={t("candidates.title")}
        actions={
          <>
            {userIsAdmin ? (
              <Link
                href="/candidates/duplicates"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
                {t("candidates.duplicates")}
              </Link>
            ) : null}
            {/* Same dropdown as the per-vacante header (Manualmente /
                CVs / LinkedIn / CSV). Mounting without `jobId` runs the
                same flows in talent-pool mode — candidates land in the
                pool without applications. */}
            <AddCandidateMenu />
          </>
        }
      />

      {recentIds && recentIds.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-positive-soft bg-positive-soft/40 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-positive">
            <Sparkles className="h-3.5 w-3.5" />
            {recentIds.length === 1
              ? t("candidates.recentAddedOne", { count: recentIds.length })
              : t("candidates.recentAddedMany", { count: recentIds.length })}
          </span>
          <Link
            href="/candidates"
            className="text-muted-foreground hover:text-foreground"
          >
            {t("candidates.clearRecent")}
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 text-sm text-danger">
          {t("common.loadError", { message: error.message })}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <EmptyState
          title={t("candidates.emptyTitle")}
          description={t("candidates.emptyDesc")}
        />
      ) : (
        <CandidatesTable
          candidates={candidates}
          recentIds={recentIds ?? undefined}
          customFields={await loadCustomFieldsForList(
            "candidate",
            candidates.map((c) => c.id),
          )}
          total={total}
          serverSort={sortKey}
          serverDir={sortDir}
          serverQuery={q}
          serverSourceIds={sourceIds}
          companyOptions={companyOptions}
          locationOptions={locationOptions}
        />
      )}

      {slideoverId ? (
        <Suspense fallback={<CandidatePanelSkeleton />}>
          <CandidatePanelAsync
            candidateId={slideoverId}
            tab={slideoverTab}
          />
        </Suspense>
      ) : null}
    </PageContainer>
  );
}

/** Parse + validate `?recent=id1,id2,id3` query param. */
function parseRecentIds(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID_RE.test(s))
    .slice(0, MAX_RECENT_IDS);
  return ids.length > 0 ? ids : null;
}

/**
 * Dedupe a list of strings and return the top N by frequency, sorted
 * descending. Used to derive filter options for high-cardinality
 * free-text columns (company name, location). Null/empty values are
 * skipped. Trimmed before grouping so "Stripe " and "Stripe" collapse.
 */
function topByFrequency(
  values: Array<string | null>,
  limit: number,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}
