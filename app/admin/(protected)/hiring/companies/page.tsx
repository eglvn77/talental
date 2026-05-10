import Link from "next/link";
import {
  hiring,
  type CompanyRow,
  type CompanyStatus,
  type NoteRow,
  type RoleRow,
} from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CreateCompanyButton } from "./create-company-form";
import { CompanySlideover } from "./company-slideover";

export const dynamic = "force-dynamic";

const STATUS_TABS: Array<{ key: CompanyStatus | "all"; label: string; color?: string }> = [
  { key: "all", label: "All" },
  { key: "client", label: "Client", color: "#22c55e" },
  { key: "prospect", label: "Prospect", color: "#f97316" },
  { key: "partner", label: "Partner", color: "#3b82f6" },
  { key: "none", label: "Other", color: "#94a3b8" },
];

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; company?: string }>;
}) {
  const params = await searchParams;
  const status = params.status as CompanyStatus | "all" | undefined;
  const q = (params.q ?? "").trim();
  const slideoverCompanyId = params.company;

  const db = hiring();
  let req = db.from("companies").select("*").order("name", { ascending: true });
  if (status && status !== "all") req = req.eq("status", status);
  if (q) req = req.ilike("name", `%${q}%`);
  const { data, error } = await req;
  const companies = (data ?? []) as CompanyRow[];

  // Counts per status for the tab labels.
  const { data: countRows } = await db
    .from("companies")
    .select("status");
  const counts = new Map<CompanyStatus | "all", number>();
  counts.set("all", (countRows ?? []).length);
  for (const r of (countRows ?? []) as Array<{ status: CompanyStatus }>) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }

  let slideoverCompany: CompanyRow | null = null;
  let slideoverRoles: RoleRow[] = [];
  let slideoverNotes: NoteRow[] = [];
  if (slideoverCompanyId) {
    const { data: comp } = await db
      .from("companies")
      .select("*")
      .eq("id", slideoverCompanyId)
      .maybeSingle();
    slideoverCompany = (comp ?? null) as CompanyRow | null;
    if (slideoverCompany) {
      const [{ data: linkedRoles }, { data: noteRows }] = await Promise.all([
        db
          .from("roles")
          .select("*")
          .eq("company_id", slideoverCompany.id)
          .order("created_at", { ascending: false }),
        db
          .from("notes")
          .select("*")
          .eq("entity_type", "company")
          .eq("entity_id", slideoverCompany.id)
          .order("created_at", { ascending: false }),
      ]);
      slideoverRoles = (linkedRoles ?? []) as RoleRow[];
      slideoverNotes = (noteRows ?? []) as NoteRow[];
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Companies</h1>
          <p className="text-sm text-muted-foreground">
            Organizations you track — clients, prospects, partners.
          </p>
        </div>
        <CreateCompanyButton />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {STATUS_TABS.map((t) => {
          const isActive = (status ?? "all") === t.key;
          return (
            <Link
              key={t.key}
              href={
                t.key === "all"
                  ? "/admin/hiring/companies"
                  : `/admin/hiring/companies?status=${t.key}`
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted",
              )}
            >
              {t.color ? (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: t.color }}
                />
              ) : null}
              {t.label}{" "}
              <span className="text-xs opacity-70">
                {counts.get(t.key) ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search companies…"
          className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {status && status !== "all" ? (
          <input type="hidden" name="status" value={status} />
        ) : null}
      </form>

      {error ? (
        <p className="mb-3 text-sm text-red-600">
          Failed to load: {error.message}
        </p>
      ) : null}

      {companies.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No companies match. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((c) => {
                const qs = new URLSearchParams();
                if (status && status !== "all") qs.set("status", status);
                if (q) qs.set("q", q);
                qs.set("company", c.id);
                const href = `/admin/hiring/companies?${qs.toString()}`;
                return (
                <tr key={c.id} className="cursor-pointer hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={href} className="flex items-center gap-2" scroll={false}>
                      {c.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.logo_url}
                          alt=""
                          className="h-6 w-6 rounded border border-border bg-white object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded border border-border bg-muted text-[10px] uppercase text-muted-foreground">
                          {c.name[0] ?? "?"}
                        </span>
                      )}
                      <span>{c.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.domain ? (
                      <a
                        href={c.website_url ?? `https://${c.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {c.domain}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={c.status} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {slideoverCompany ? (
        <CompanySlideover
          company={slideoverCompany}
          roles={slideoverRoles}
          notes={slideoverNotes}
          revalidatePath="/admin/hiring/companies"
        />
      ) : null}
    </main>
  );
}

function StatusPill({ status }: { status: CompanyStatus }) {
  const color =
    status === "client"
      ? "#22c55e"
      : status === "prospect"
        ? "#f97316"
        : status === "partner"
          ? "#3b82f6"
          : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5 text-xs">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {status}
    </span>
  );
}
