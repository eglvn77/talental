import { Mic } from "lucide-react";

/**
 * Read-only list of recent interview transcripts (Granola + manual).
 * Click opens the full candidate page in Talental for the actual
 * transcript content — sidepanel only shows the metadata.
 */
export function SlimTranscripts({
  transcripts,
}: {
  transcripts: Array<{
    id: string;
    application_id: string | null;
    source: string;
    title: string;
    recorded_at: string;
  }>;
}) {
  if (transcripts.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Calls ({transcripts.length})
      </h2>
      <ul className="mt-2 space-y-1.5">
        {transcripts.map((t) => (
          <li
            key={t.id}
            className="flex items-start gap-2 rounded-md border border-border bg-card px-2 py-1.5"
          >
            <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{t.title}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {new Date(t.recorded_at).toLocaleString("es-MX", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}
                {t.source}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
