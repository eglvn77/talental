import { Skeleton } from "@/components/ui/skeleton";

export function CandidatesLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="mb-3 text-sm text-muted-foreground">Loading pipeline…</p>

      <div className="hidden overflow-hidden rounded-lg border border-border bg-background sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Position</th>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="w-14 px-2 py-2.5 text-center font-medium">LinkedIn</th>
              <th className="w-14 px-2 py-2.5 text-center font-medium">Files</th>
              <th className="w-14 px-2 py-2.5 text-center font-medium">Report</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-40" /></td>
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-36" /></td>
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-2.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                <td className="px-2 py-2.5 text-center"><Skeleton className="mx-auto h-8 w-8" /></td>
                <td className="px-2 py-2.5 text-center"><Skeleton className="mx-auto h-8 w-8" /></td>
                <td className="px-2 py-2.5 text-center"><Skeleton className="mx-auto h-8 w-8" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-9 w-9" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
