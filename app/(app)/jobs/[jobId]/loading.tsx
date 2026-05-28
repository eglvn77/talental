import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading boundary for a single vacante. The layout above already
 * paints the back arrow + breadcrumb shell, so this only mimes the
 * job header (title + status pill + action cluster) + the tabs row
 * + a kanban-ish placeholder grid. The real content swaps in once
 * the server finishes the parallelized loader.
 */
export default function JobLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
      <Skeleton className="mb-3 h-4 w-4 rounded" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20" />
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, col) => (
          <div
            key={col}
            className="w-72 shrink-0 space-y-2 rounded-lg border border-border bg-muted/30 p-2"
          >
            <Skeleton className="mb-1 h-7 w-32" />
            {Array.from({ length: 4 }).map((_, row) => (
              <Skeleton key={row} className="h-20 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
