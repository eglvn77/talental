import { Skeleton } from "@/components/ui/skeleton";

export function CandidatesLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="mb-3 text-sm text-muted-foreground">Loading pipeline…</p>

      <div className="hidden overflow-hidden rounded-lg border border-border bg-background sm:block">
        <table className="w-full table-fixed text-[13px]">
          <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-[13%] px-3 py-1 font-medium">Name</th>
              <th className="w-[17%] px-3 py-1 font-medium">Position</th>
              <th className="w-[12%] px-3 py-1 font-medium">Company</th>
              <th className="w-[14%] px-3 py-1 font-medium">Location</th>
              <th className="w-[12%] px-3 py-1 font-medium">Current Comp</th>
              <th className="w-[10%] px-3 py-1 font-medium">Stage</th>
              <th className="w-[6%] px-2 py-1 text-center font-medium">LinkedIn</th>
              <th className="w-[6%] px-2 py-1 text-center font-medium">Files</th>
              <th className="w-[5%] px-2 py-1 text-center font-medium">Notes</th>
              <th className="w-[5%] px-2 py-1 text-center font-medium">Report</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-1"><Skeleton className="h-3.5 w-36" /></td>
                <td className="px-3 py-1"><Skeleton className="h-3.5 w-32" /></td>
                <td className="px-3 py-1"><Skeleton className="h-3.5 w-24" /></td>
                <td className="px-3 py-1"><Skeleton className="h-3.5 w-24" /></td>
                <td className="px-3 py-1"><Skeleton className="h-3.5 w-24" /></td>
                <td className="px-3 py-1"><Skeleton className="h-4 w-16 rounded-full" /></td>
                <td className="px-2 py-1 text-center"><Skeleton className="mx-auto size-6" /></td>
                <td className="px-2 py-1 text-center"><Skeleton className="mx-auto size-6" /></td>
                <td className="px-2 py-1 text-center"><Skeleton className="mx-auto size-6" /></td>
                <td className="px-2 py-1 text-center"><Skeleton className="mx-auto size-6" /></td>
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
            <Skeleton className="h-3 w-32" />
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
