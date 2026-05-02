import { classesForStage } from "@/components/stage-badge";
import { CandidateCard, type RowCandidate } from "@/components/candidate-card";
import { cn } from "@/lib/utils";

type KanbanCandidate = RowCandidate & { stage_rank: number | null };

type StageGroup = {
  name: string;
  rank: number;
  candidates: KanbanCandidate[];
};

export function KanbanView({
  candidates,
  portalSlug,
}: {
  candidates: KanbanCandidate[];
  portalSlug: string;
}) {
  // Group by stage_name; track the highest rank per group for ordering.
  const groups = new Map<string, StageGroup>();
  for (const c of candidates) {
    const name = c.stage_name ?? "—";
    const rank = typeof c.stage_rank === "number" ? c.stage_rank : -1;
    let g = groups.get(name);
    if (!g) {
      g = { name, rank, candidates: [] };
      groups.set(name, g);
    } else if (rank > g.rank) {
      g.rank = rank;
    }
    g.candidates.push(c);
  }

  // Funnel order: lowest rank (Sourced) on the left, highest (Hired) on the right.
  const ordered = Array.from(groups.values()).sort((a, b) => a.rank - b.rank);

  return (
    <>
      {/* Desktop: horizontal columns */}
      <div className="hidden gap-3 overflow-x-auto pb-2 sm:flex">
        {ordered.map((g) => (
          <div
            key={g.name}
            className="flex w-72 flex-shrink-0 flex-col rounded-lg border border-border bg-muted/20"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span
                className={cn(
                  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
                  classesForStage(g.name),
                )}
              >
                {g.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {g.candidates.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {g.candidates.map((c) => (
                <CandidateCard
                  key={c.manatal_candidate_id}
                  candidate={c}
                  portalSlug={portalSlug}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: vertical stacked sections, one per stage */}
      <div className="flex flex-col gap-4 sm:hidden">
        {ordered.map((g) => (
          <section key={g.name}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
                  classesForStage(g.name),
                )}
              >
                {g.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {g.candidates.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {g.candidates.map((c) => (
                <CandidateCard
                  key={c.manatal_candidate_id}
                  candidate={c}
                  portalSlug={portalSlug}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

