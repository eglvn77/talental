import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { hiring, type CompanyRow } from "@/lib/hiring";
import { loadCompanyStatuses, companyStatusMap } from "@/lib/company-status";
import { loadCustomFieldsForList } from "@/lib/custom-fields";
import { getT } from "@/lib/i18n/server";
import { EmptyState } from "../_components/empty-state";
import { PageContainer, PageHeader } from "../_components/page-shell";
import { CreateCompanyButton } from "./create-company-form";
import { CompaniesTable } from "./companies-table";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    per?: string;
    q?: string;
    status?: string;
    funding?: string;
    industry?: string;
    size?: string;
    country?: string;
    has_jobs?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const PER_PAGE_OPTIONS = new Set([25, 50, 100, 200]);
  const perRaw = Number(params.per ?? 25);
  const per = PER_PAGE_OPTIONS.has(perRaw) ? perRaw : 25;
  const pageRaw = Number(params.page ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const offset = (page - 1) * per;
  const q = (params.q ?? "").trim();
  const statusList = (params.status ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const fundingList = (params.funding ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const industryList = (params.industry ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const countryList = (params.country ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Size buckets — UI exposes 5 chips; each maps to a numeric range.
  // Multi-select via OR clause. Whitelist values defensively.
  const SIZE_RANGES: Record<string, [number, number | null]> = {
    "1-10": [1, 10],
    "11-50": [11, 50],
    "51-200": [51, 200],
    "201-1000": [201, 1000],
    "1000+": [1001, null],
  };
  const sizeBuckets = (params.size ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => Boolean(SIZE_RANGES[s]));
  const hasJobsFilter = params.has_jobs === "true";

  const SORT_COLUMNS: Record<string, string> = {
    name: "name",
    domain: "domain",
    status: "status",
    industry: "industry",
    employee_count: "employee_count",
    hq_country: "hq_country",
    created: "created_at",
  };
  const sortKey = params.sort && SORT_COLUMNS[params.sort] ? params.sort : "name";
  const sortCol = SORT_COLUMNS[sortKey];
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const db = await hiring();
  const safeQ = q.replace(/[%_,()]/g, "");

  // "Has open jobs" filter — pre-resolve company_ids of companies
  // that have at least one job in an is_open status. Only when active
  // to avoid the extra round-trip on the common path.
  let openCompanyIds: string[] | null = null;
  if (hasJobsFilter) {
    const { data: openStatuses } = await db
      .from("job_statuses")
      .select("id")
      .eq("is_open", true);
    const openStatusIds = (openStatuses ?? []).map(
      (r) => (r as { id: string }).id,
    );
    if (openStatusIds.length === 0) {
      openCompanyIds = []; // workspace has no open statuses → empty result
    } else {
      const { data: jobsRows } = await db
        .from("jobs")
        .select("company_id")
        .in("status_id", openStatusIds)
        .not("company_id", "is", null);
      openCompanyIds = Array.from(
        new Set(
          (jobsRows ?? [])
            .map((r) => (r as { company_id: string | null }).company_id)
            .filter((v): v is string => Boolean(v)),
        ),
      );
    }
  }

  // Size buckets — translate to a PostgREST `or` clause on
  // employee_count. e.g. ["11-50","201-1000"] → "and(.gte.11,.lte.50),and(.gte.201,.lte.1000)"
  const sizeOrClause =
    sizeBuckets.length > 0
      ? sizeBuckets
          .map((b) => {
            const [lo, hi] = SIZE_RANGES[b];
            return hi == null
              ? `and(employee_count.gte.${lo})`
              : `and(employee_count.gte.${lo},employee_count.lte.${hi})`;
          })
          .join(",")
      : null;

  let dataQ = db.from("companies").select("*");
  let countQ = db.from("companies").select("id", { count: "exact", head: true });
  if (safeQ) {
    const pat = `%${safeQ}%`;
    const orFilter = `name.ilike.${pat},domain.ilike.${pat}`;
    dataQ = dataQ.or(orFilter);
    countQ = countQ.or(orFilter);
  }
  if (statusList.length > 0) {
    dataQ = dataQ.in("status", statusList);
    countQ = countQ.in("status", statusList);
  }
  if (fundingList.length > 0) {
    dataQ = dataQ.in("funding_stage", fundingList);
    countQ = countQ.in("funding_stage", fundingList);
  }
  if (industryList.length > 0) {
    dataQ = dataQ.in("industry", industryList);
    countQ = countQ.in("industry", industryList);
  }
  if (countryList.length > 0) {
    dataQ = dataQ.in("hq_country", countryList);
    countQ = countQ.in("hq_country", countryList);
  }
  if (sizeOrClause) {
    dataQ = dataQ.or(sizeOrClause);
    countQ = countQ.or(sizeOrClause);
  }
  if (openCompanyIds !== null) {
    if (openCompanyIds.length === 0) {
      // Force empty result (companies cannot have id "<none>").
      dataQ = dataQ.eq("id", "00000000-0000-0000-0000-000000000000");
      countQ = countQ.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      dataQ = dataQ.in("id", openCompanyIds);
      countQ = countQ.in("id", openCompanyIds);
    }
  }

  // Options queries — distinct industry + country values (top 200 by
  // frequency). Inline approach matches Phase C's; helper extraction
  // deferred until the third user of the pattern.
  const industryOptionsQuery = db
    .from("companies")
    .select("industry")
    .not("industry", "is", null)
    .neq("industry", "")
    .limit(2000);
  const countryOptionsQuery = db
    .from("companies")
    .select("hq_country")
    .not("hq_country", "is", null)
    .neq("hq_country", "")
    .limit(2000);

  const [{ data, error }, statusRows, countRes, industryOptsRes, countryOptsRes] =
    await Promise.all([
      dataQ
        .order(sortCol, { ascending: sortDir === "asc" })
        .range(offset, offset + per - 1),
      loadCompanyStatuses(),
      countQ,
      industryOptionsQuery,
      countryOptionsQuery,
    ]);
  const companiesTotal = countRes.count ?? 0;
  const companies = (data ?? []) as CompanyRow[];

  const industryOptions = topByFrequency(
    (industryOptsRes.data ?? []).map(
      (r) => (r as { industry: string | null }).industry,
    ),
    200,
  );
  const countryOptions = topByFrequency(
    (countryOptsRes.data ?? []).map(
      (r) => (r as { hq_country: string | null }).hq_country,
    ),
    200,
  );
  const statusConfig = companyStatusMap(statusRows);
  const statusOrder = statusRows.map((r) => r.key);
  const t = await getT();

  return (
    <PageContainer>
      <PageHeader
        title={t("companies.title")}
        actions={
          <Link
            href="/companies?create=1"
            scroll={false}
            aria-label={t("companies.newCompany")}
            title={t("companies.newCompany")}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-fg-on-accent transition-colors hover:bg-accent/90"
          >
            <Building2 className="h-4 w-4" />
            <Plus
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent stroke-[3] ring-2 ring-bg-1"
              aria-hidden
            />
          </Link>
        }
      />
      {/* URL-driven create modal — opens on `?create=1`. */}
      <CreateCompanyButton
        statuses={statusRows.map((r) => ({ value: r.key, label: r.label }))}
      />

      {error ? (
        <p className="mb-3 text-sm text-danger">
          {t("common.loadError", { message: error.message })}
        </p>
      ) : null}

      {companies.length === 0 ? (
        <EmptyState
          title={t("companies.emptyTitle")}
          description={t("companies.emptyDesc")}
        />
      ) : (
        <CompaniesTable
          companies={companies}
          statusConfig={statusConfig}
          statusOrder={statusOrder}
          customFields={await loadCustomFieldsForList(
            "company",
            companies.map((c) => c.id),
          )}
          total={companiesTotal}
          industryOptions={industryOptions}
          countryOptions={countryOptions}
        />
      )}

      {/* The `?company=<id>` slideover is mounted globally in
          (app)/layout.tsx so any route can open a company profile
          without leaving the current page. */}
    </PageContainer>
  );
}

/**
 * Dedupe + count strings, return top N by frequency. Pure JS helper
 * for high-cardinality filter option lists (industry, hq_country).
 * Mirrors the same helper used in /candidates page.tsx — extracted
 * to a shared lib if a third caller appears.
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
