import { Clock } from "lucide-react";

/**
 * Latest application_events for the candidate (stage moves, status
 * changes, etc.). Read-only; clicking opens the full Talental view
 * for richer history.
 */
export function SlimActivity({
  events,
}: {
  events: Array<{
    id: string;
    event_type: string;
    payload: Record<string, unknown> | null;
    created_at: string;
  }>;
}) {
  if (events.length === 0) return null;

  // Friendly labels for the common event types. Anything not in this
  // map falls back to the raw event_type — better than hiding it.
  const LABELS: Record<string, string> = {
    stage_changed: "Stage cambió",
    status_changed: "Estado cambió",
    note_added: "Nota agregada",
    application_created: "Aplicación creada",
    rejected: "Rechazado",
  };

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Actividad
      </h2>
      <ul className="mt-2 space-y-1">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex items-start gap-2 px-2 py-1 text-xs"
          >
            <Clock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="text-foreground">
                {LABELS[e.event_type] ?? e.event_type}
              </span>
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                {new Date(e.created_at).toLocaleString("es-MX", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
