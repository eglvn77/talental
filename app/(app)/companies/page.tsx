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
  const SORT_COLUMNS: Record<string, string> = {
    name: "name",
    domain: "domain",
    status: "status",
    created: "created_at",
  };
  const sortKey = params.sort && SORT_COLUMNS[params.sort] ? params.sort : "name";
  const sortCol = SORT_COLUMNS[sortKey];
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const db = await hiring();
  const safeQ = q.replace(/[%_,()]/g, "");
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
  const [{ data, error }, statusRows, countRes] = await Promise.all([
    dataQ
      .order(sortCol, { ascending: sortDir === "asc" })
      .range(offset, offset + per - 1),
    loadCompanyStatuses(),
    countQ,
  ]);
  const companiesTotal = countRes.count ?? 0;
  const companies = (data ?? []) as CompanyRow[];
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
        />
      )}

      {/* The `?company=<id>` slideover is mounted globally in
          (app)/layout.tsx so any route can open a company profile
          without leaving the current page. */}
    </PageContainer>
  );
}
