import Link from "next/link";
import { notFound } from "next/navigation";
import { hiring, type ClientRow, type CompanyRow, type RoleRow } from "@/lib/hiring";
import { formatSalaryRange } from "@/lib/format";
import { RoleStatusSelect } from "../status-select";
import { AddCandidateForm } from "./add-candidate";
import { RoleTabs } from "./role-tabs";

export const dynamic = "force-dynamic";

export default async function RoleLayout({
  params,
  children,
}: {
  params: Promise<{ jobId: string }>;
  children: React.ReactNode;
}) {
  const { jobId: roleId } = await params;
  const db = hiring();

  const { data: roleData } = await db
    .from("roles")
    .select("*")
    .eq("id", roleId)
    .maybeSingle();
  if (!roleData) notFound();
  const role = roleData as RoleRow;

  const [clientResult, companyResult] = await Promise.all([
    db.from("clients").select("*").eq("id", role.client_id).maybeSingle(),
    role.company_id
      ? db.from("companies").select("*").eq("id", role.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const client = clientResult.data as ClientRow | null;
  const company = (companyResult.data ?? null) as CompanyRow | null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <Link
          href="/jobs"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Vacantes
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold">{role.title}</h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {role.status}
            </span>
            {company ? (
              <Link
                href={`/companies?company=${company.id}`}
                className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
              >
                {company.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={company.logo_url}
                    alt=""
                    className="h-4 w-4 rounded object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                {company.name}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">
                {client?.company_name ?? "—"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {[
              role.location,
              formatSalaryRange(role.salary_min, role.salary_max, role.salary_currency),
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RoleStatusSelect roleId={role.id} current={role.status} />
          <AddCandidateForm roleId={role.id} />
        </div>
      </div>

      <RoleTabs roleId={role.id} />

      <div className="mt-2">{children}</div>
    </div>
  );
}
