import Link from "next/link";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { PageContainer, PageHeader } from "../_components/page-shell";
import { SequencesTable, type SequenceListRow } from "./_components/sequences-table";
import { NewSequenceButton } from "./_components/new-sequence-dialog";
import { AnalyticsTab } from "./_components/analytics-tab";
import { HealthTab } from "./_components/health-tab";
import { QueueTab } from "./_components/queue-tab";
import { ErrorsTab } from "./_components/errors-tab";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "sequences", label: "Sequences" },
  { key: "analytics", label: "Analytics" },
  { key: "health", label: "Health Dashboard" },
  { key: "queue", label: "Queue" },
  { key: "errors", label: "Errors" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function parseTab(raw: string | undefined): TabKey {
  return (TABS.some((t) => t.key === raw) ? raw : "sequences") as TabKey;
}

export default async function SequencesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; q?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // List + aggregates (all tabs share the header count).
  const { data: seqRows } = await db
    .from("sequences")
    .select("id, name, status, priority, created_at, updated_at, settings")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false });

  const seqIds = (seqRows ?? []).map((s) => s.id as string);
  const enrollmentAgg = new Map<string, { total: number; active: number; replied: number }>();
  const sentAgg = new Map<string, number>();
  if (seqIds.length > 0) {
    const { data: enr } = await db
      .from("sequence_enrollments")
      .select("sequence_id, status")
      .in("sequence_id", seqIds);
    for (const e of enr ?? []) {
      const key = e.sequence_id as string;
      const agg = enrollmentAgg.get(key) ?? { total: 0, active: 0, replied: 0 };
      agg.total++;
      if (e.status === "active") agg.active++;
      if (e.status === "replied") agg.replied++;
      enrollmentAgg.set(key, agg);
    }
    const { data: sent } = await db
      .from("sequence_queue")
      .select("sequence_id")
      .in("sequence_id", seqIds)
      .eq("status", "completed");
    for (const q of sent ?? []) {
      const key = q.sequence_id as string;
      sentAgg.set(key, (sentAgg.get(key) ?? 0) + 1);
    }
  }

  let rows: SequenceListRow[] = (seqRows ?? []).map((s) => {
    const agg = enrollmentAgg.get(s.id as string) ?? { total: 0, active: 0, replied: 0 };
    return {
      id: s.id as string,
      name: s.name as string,
      status: s.status as string,
      priority: (s.priority as number) ?? 0,
      total: agg.total,
      active: agg.active,
      replied: agg.replied,
      sent: sentAgg.get(s.id as string) ?? 0,
    };
  });
  const statusCounts = {
    all: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    paused: rows.filter((r) => r.status === "paused").length,
    draft: rows.filter((r) => r.status === "draft").length,
  };
  if (sp.status && ["active", "paused", "draft"].includes(sp.status)) {
    rows = rows.filter((r) => r.status === sp.status);
  }
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  }

  return (
    <PageContainer className="max-w-[1400px]">
      <PageHeader
        title="Sequences"
        meta={`${statusCounts.all} sequences`}
        actions={<NewSequenceButton existing={rows.map((r) => ({ id: r.id, name: r.name }))} />}
      />

      {/* Tab bar */}
      <nav className="mt-2 flex items-center gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "sequences" ? "/sequences" : `/sequences?tab=${t.key}`}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        {tab === "sequences" ? (
          <SequencesTable rows={rows} statusCounts={statusCounts} activeStatus={sp.status ?? null} q={sp.q ?? ""} />
        ) : tab === "analytics" ? (
          <AnalyticsTab workspaceId={workspaceId} range={sp.range} />
        ) : tab === "health" ? (
          <HealthTab workspaceId={workspaceId} />
        ) : tab === "queue" ? (
          <QueueTab workspaceId={workspaceId} status={sp.status} />
        ) : (
          <ErrorsTab workspaceId={workspaceId} />
        )}
      </div>
    </PageContainer>
  );
}
