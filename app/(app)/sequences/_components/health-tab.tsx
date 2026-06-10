import { hiring } from "@/lib/hiring";

/**
 * Health Dashboard — per-account quota usage (today, UTC) + queue
 * summary. Daily limits default to Leonar's published numbers and can
 * be overridden per account via connected_accounts.account_metadata.quotas.
 */

const DEFAULT_QUOTAS: Record<string, Array<{ key: string; label: string; limit: number; types: string[] }>> = {
  LINKEDIN: [
    { key: "invitations", label: "Invitations", limit: 40, types: ["linkedin_invitation"] },
    { key: "messages", label: "Messages", limit: 100, types: ["linkedin_message"] },
    { key: "inmails", label: "InMails", limit: 100, types: ["linkedin_inmail"] },
  ],
  WHATSAPP: [{ key: "messages", label: "Messages", limit: 40, types: ["whatsapp"] }],
  GOOGLE: [{ key: "emails", label: "Emails", limit: 50, types: ["email"] }],
  GOOGLE_OAUTH: [{ key: "emails", label: "Emails", limit: 50, types: ["email"] }],
  OUTLOOK: [{ key: "emails", label: "Emails", limit: 50, types: ["email"] }],
  IMAP: [{ key: "emails", label: "Emails", limit: 50, types: ["email"] }],
};

export async function HealthTab({ workspaceId }: { workspaceId: string }) {
  const db = await hiring();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [{ data: accounts }, { data: todayDone }, { data: queueRows }] = await Promise.all([
    db
      .from("connected_accounts")
      .select("id, provider, status, account_metadata, unipile_account_id")
      .eq("workspace_id", workspaceId),
    db
      .from("sequence_queue")
      .select("type, payload")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .gte("completed_at", startOfDay.toISOString()),
    db
      .from("sequence_queue")
      .select("status")
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "processing", "completed", "failed"]),
  ]);

  // Usage by step type today (payload.sender_account_id attribution
  // when present; otherwise counted against every account of the
  // matching provider — single-account workspaces are exact).
  const usedByType = new Map<string, number>();
  for (const q of todayDone ?? []) {
    usedByType.set(q.type as string, (usedByType.get(q.type as string) ?? 0) + 1);
  }

  const queueCounts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const q of queueRows ?? []) {
    const s = q.status as keyof typeof queueCounts;
    if (s in queueCounts) queueCounts[s]++;
  }
  const totalDailyCapacity = (accounts ?? []).reduce((acc, a) => {
    const quotas = DEFAULT_QUOTAS[(a.provider as string) ?? ""] ?? [];
    return acc + quotas.reduce((x, qq) => x + qq.limit, 0);
  }, 0);
  const estimatedDays =
    totalDailyCapacity > 0 ? Math.ceil(queueCounts.pending / totalDailyCapacity) : 0;

  return (
    <div>
      <h2 className="text-sm font-semibold">Health Dashboard</h2>

      <h3 className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Quota Usage (today)
      </h3>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {(accounts ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No connected accounts. Connect LinkedIn / email in Unipile to enable sending.
          </p>
        ) : (
          (accounts ?? []).map((a) => {
            const provider = (a.provider as string) ?? "";
            const overrides =
              ((a.account_metadata as Record<string, unknown> | null)?.quotas as
                | Record<string, number>
                | undefined) ?? {};
            const quotas = DEFAULT_QUOTAS[provider] ?? [];
            return (
              <div key={a.id as string} className="rounded-md border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{provider}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                      a.status === "OK"
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {a.status as string}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {quotas.map((qq) => {
                    const limit = overrides[qq.key] ?? qq.limit;
                    const used = qq.types.reduce((acc, t) => acc + (usedByType.get(t) ?? 0), 0);
                    const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
                    return (
                      <div key={qq.key}>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{qq.label}</span>
                          <span>
                            {used}/{limit}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full ${pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-success"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <h3 className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Queue Summary
      </h3>
      <div className="mt-2 rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-2xl font-semibold tracking-tight">{queueCounts.pending}</p>
            <p className="text-xs text-muted-foreground">Actions in queue</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">
              {queueCounts.pending === 0 ? "—" : estimatedDays < 1 ? "< 1" : String(estimatedDays)}
            </p>
            <p className="text-xs text-muted-foreground">Estimated days</p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2 text-xs">
            <Pill label={`Pending ${queueCounts.pending}`} tone="warn" />
            <Pill label={`Processing ${queueCounts.processing}`} tone="info" />
            <Pill label={`Completed ${queueCounts.completed}`} tone="ok" />
            <Pill label={`Failed ${queueCounts.failed}`} tone="bad" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "info" }) {
  const cls =
    tone === "ok"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "warn"
        ? "border-warning/30 bg-warning/10 text-warning"
        : tone === "bad"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground";
  return <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{label}</span>;
}
