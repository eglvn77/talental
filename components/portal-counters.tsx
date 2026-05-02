import type { CandidateCounters } from "@/lib/cache";

export function PortalCounters({ counters }: { counters: CandidateCounters }) {
  const items: Array<{ label: string; value: number }> = [
    { label: "In Process", value: counters.inProcess },
    { label: "Submitted", value: counters.submitted },
    { label: "Rejected", value: counters.rejected },
  ];
  return (
    <div className="flex items-baseline gap-6 text-sm">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {it.label}
          </span>
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}
