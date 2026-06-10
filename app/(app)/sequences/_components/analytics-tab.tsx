import Link from "next/link";
import { hiring } from "@/lib/hiring";

/**
 * Analytics & Monitoring — KPIs over the selected date range.
 * Sent = completed queue actions; Errors = failed; Scheduled =
 * pending upcoming; Reply rate = replied enrollments updated in range
 * vs sent.
 */
export async function AnalyticsTab({
  workspaceId,
  range = "7d",
}: {
  workspaceId: string;
  range?: string;
}) {
  const db = await hiring();
  const days = range === "today" ? 1 : range === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: doneRows }, { data: failedRows }, { count: scheduled }, { data: repliedRows }] =
    await Promise.all([
      db
        .from("sequence_queue")
        .select("id, type, completed_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "completed")
        .gte("completed_at", since),
      db
        .from("sequence_queue")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("status", "failed")
        .gte("scheduled_at", since),
      db
        .from("sequence_queue")
        .select("id", { head: true, count: "exact" })
        .eq("workspace_id", workspaceId)
        .eq("status", "pending"),
      db
        .from("sequence_enrollments")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("status", "replied")
        .gte("replied_at", since),
    ]);

  const sent = doneRows?.length ?? 0;
  const errors = failedRows?.length ?? 0;
  const replies = repliedRows?.length ?? 0;
  const failureRate = sent + errors > 0 ? Math.round((errors / (sent + errors)) * 100) : 0;
  const replyRate = sent > 0 ? Math.round((replies / sent) * 100) : 0;

  // Per-day activity for a lightweight bar list (no chart lib).
  const byDay = new Map<string, number>();
  for (const r of doneRows ?? []) {
    const day = ((r.completed_at as string) ?? "").slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const dayRows = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const maxDay = Math.max(1, ...dayRows.map(([, c]) => c));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Analytics &amp; Monitoring</h2>
          <p className="text-xs text-muted-foreground">
            The selected date range controls KPIs and activity.
          </p>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border text-xs">
          {[
            { key: "today", label: "Today" },
            { key: "7d", label: "7d" },
            { key: "30d", label: "30d" },
          ].map((r) => (
            <Link
              key={r.key}
              href={`/sequences?tab=analytics&range=${r.key}`}
              className={`px-2.5 py-1 ${
                range === r.key ? "bg-foreground text-background" : "bg-card hover:bg-muted"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Sent" value={String(sent)} hint="Completed sequence actions" />
        <Kpi label="Errors" value={String(errors)} hint={`${failureRate}% failure rate`} />
        <Kpi label="Scheduled" value={String(scheduled ?? 0)} hint="Pending actions coming up" />
        <Kpi label="Reply rate" value={`${replyRate}%`} hint={`${replies} replies in the period`} />
      </div>

      <div className="mt-4 rounded-md border border-border bg-card p-4">
        {dayRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No campaign data yet. Start a campaign to see your analytics here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {dayRows.map(([day, count]) => (
              <div key={day} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-muted-foreground">{day.slice(5)}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-foreground/70"
                    style={{ width: `${Math.round((count / maxDay) * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
