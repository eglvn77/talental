import Link from "next/link";
import { Sparkles, Copy } from "lucide-react";
import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { loadCustomFieldsForList } from "@/lib/custom-fields";
import { CandidatesTable, type CandidateListRow } from "./candidates-table";
import { EmptyState } from "../_components/empty-state";
import { loadCandidateView } from "./load-candidate-view";
import { CandidateSlideoverShell } from "./candidate-slideover-shell";
import { CandidateProfileView, parseTab } from "./candidate-profile-view";
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

  // Sort whitelist — anything not on this list falls back to
  // updated_at desc. Server-side sort is necessary so pagination is
  // meaningful (page 2 must come after page 1 in the same order).
  const SORT_COLUMNS: Record<string, string> = {
    name: "full_name",
    email: "email",
    source: "default_source",
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

  // Data query — server-side filtered + sorted + paged.
  let dataQ = db
    .from("candidates")
    .select(
      `
      id, full_name, email, phone, linkedin_url, resume_url,
      default_source, created_at,
      applications:applications(
        id, job_id, applied_at, status_changed_at,
        job:jobs(id, title)
      )
      `,
    )
    .is("linked_contact_id", null);
  if (orFilter) dataQ = dataQ.or(orFilter);
  if (sourceIds.length > 0) dataQ = dataQ.in("default_source", sourceIds);
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
  const countQuery = countQ;

  // Talent pool: every candidate in the workspace + their applications
  // with the job title for context. The client-side filter/sort +
  // 100-row "Load more" chunks below keeps render cost flat regardless
  // of total row count.
  //
  // The `?recent=<ids>` query param no longer filters the list (that
  // hid existing candidates and surprised users). Instead, we pass the
  // ids to the table for a "Nuevo" pill on those rows. Default sort
  // is created_at desc so the just-imported ones already float on top.
  const [slideoverView, me, { data, error }, countRes] = await Promise.all([
    slideoverId ? loadCandidateView(slideoverId) : Promise.resolve(null),
    getCurrentUser(),
    candidatesQuery,
    countQuery,
  ]);
  const userIsAdmin = me ? isAdmin(me.team_member) : false;
  const t = await getT();
  const total = countRes.count ?? 0;

  const candidates = ((data ?? []) as CandidateListRow[]).map((c) => ({
    ...c,
    applications: (c.applications ?? []).slice().sort((a, b) =>
      (b.applied_at ?? "").localeCompare(a.applied_at ?? ""),
    ),
  }));

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("candidates.title")}</h1>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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
        />
      )}

      {slideoverView ? (
        <CandidateSlideoverShell
          candidateName={slideoverView.bundle.candidate.full_name}
        >
          <CandidateProfileView
            view={slideoverView}
            tab={slideoverTab}
            mode="panel"
            isAdmin={userIsAdmin}
            mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
            t={t}
          />
        </CandidateSlideoverShell>
      ) : null}
    </main>
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
