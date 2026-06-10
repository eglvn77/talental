import { CheckCircle2 } from "lucide-react";
import { hiring } from "@/lib/hiring";
import { QueueList } from "./queue-list";

/** Errors tab — failed actions with retry. */
export async function ErrorsTab({ workspaceId }: { workspaceId: string }) {
  const db = await hiring();
  const { data: rows } = await db
    .from("sequence_queue")
    .select(
      "id, type, status, scheduled_at, attempts, error, sequence:sequences(name), enrollment:sequence_enrollments(entity_id)",
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "failed")
    .order("scheduled_at", { ascending: false })
    .limit(100);

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card px-4 py-12 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-success" />
        <p className="text-sm font-medium">No errors</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          All actions are running smoothly. Great job!
        </p>
      </div>
    );
  }

  const entityIds = [
    ...new Set(
      rows
        .map((r) => {
          const enr = r.enrollment as { entity_id?: string } | { entity_id?: string }[] | null;
          return Array.isArray(enr) ? enr[0]?.entity_id : enr?.entity_id;
        })
        .filter(Boolean) as string[],
    ),
  ];
  const nameById = new Map<string, string>();
  if (entityIds.length > 0) {
    const { data: cands } = await db
      .from("candidates")
      .select("id, full_name")
      .in("id", entityIds);
    for (const c of cands ?? []) nameById.set(c.id as string, (c.full_name as string) ?? "");
  }

  const items = rows.map((r) => {
    const seq = r.sequence as { name?: string } | { name?: string }[] | null;
    const enr = r.enrollment as { entity_id?: string } | { entity_id?: string }[] | null;
    const entityId = Array.isArray(enr) ? enr[0]?.entity_id : enr?.entity_id;
    return {
      id: r.id as string,
      type: r.type as string,
      status: r.status as string,
      scheduledAt: (r.scheduled_at as string | null) ?? null,
      attempts: (r.attempts as number) ?? 0,
      error: (r.error as string | null) ?? null,
      sequenceName: (Array.isArray(seq) ? seq[0]?.name : seq?.name) ?? "(sequence)",
      contactName: entityId ? nameById.get(entityId) ?? "(contact)" : "(contact)",
    };
  });

  return <QueueList items={items} activeStatus={null} mode="errors" />;
}
