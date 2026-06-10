import { hiring } from "@/lib/hiring";
import { QueueList } from "./queue-list";

/** Queue tab — upcoming/processing actions with cancel. */
export async function QueueTab({
  workspaceId,
  status,
}: {
  workspaceId: string;
  status?: string;
}) {
  const db = await hiring();
  let query = db
    .from("sequence_queue")
    .select(
      "id, type, status, scheduled_at, attempts, error, sequence:sequences(name), enrollment:sequence_enrollments(entity_id)",
    )
    .eq("workspace_id", workspaceId)
    .order("scheduled_at", { ascending: true })
    .limit(100);
  if (status && ["pending", "processing", "completed", "failed", "cancelled"].includes(status)) {
    query = query.eq("status", status);
  } else {
    query = query.in("status", ["pending", "processing"]);
  }
  const { data: rows } = await query;

  // Candidate names for display
  const entityIds = [
    ...new Set(
      (rows ?? [])
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

  const items = (rows ?? []).map((r) => {
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

  return <QueueList items={items} activeStatus={status ?? null} mode="queue" />;
}
