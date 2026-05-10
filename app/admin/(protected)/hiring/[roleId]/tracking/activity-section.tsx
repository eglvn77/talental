import { type ApplicationEventRow, type PipelineStageRow } from "@/lib/hiring";

export function ActivitySection({
  events,
  stagesById,
}: {
  events: ApplicationEventRow[];
  stagesById: Record<string, PipelineStageRow>;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  const groups = new Map<string, ApplicationEventRow[]>();
  for (const e of events) {
    const day = new Date(e.created_at).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([day, evts]) => (
        <div key={day}>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {day}
          </h4>
          <ul className="space-y-1.5">
            {evts.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  ·{" "}
                </span>
                <EventDescription event={e} stagesById={stagesById} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EventDescription({
  event,
  stagesById,
}: {
  event: ApplicationEventRow;
  stagesById: Record<string, PipelineStageRow>;
}) {
  if (event.event_type === "stage_changed") {
    const payload = event.payload as {
      from_stage_id?: string;
      to_stage_id?: string;
      to_category?: string;
    } | null;
    const from = payload?.from_stage_id
      ? stagesById[payload.from_stage_id]?.name ?? "—"
      : "—";
    const to = payload?.to_stage_id
      ? stagesById[payload.to_stage_id]?.name ?? "—"
      : "—";
    return (
      <span>
        Moved from <span className="font-medium">{from}</span> to{" "}
        <span className="font-medium">{to}</span>
      </span>
    );
  }
  return <span className="text-muted-foreground">{event.event_type}</span>;
}
