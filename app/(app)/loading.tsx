import { Skeleton } from "@/components/ui/skeleton";

/**
 * Root loading boundary for every authed route. Without this, React
 * Server Components freeze the previous page until the new one is
 * fully rendered — perceived as "click → nothing → all at once".
 * The skeleton renders instantly so the navigation gets immediate
 * visual feedback, even though the underlying server work hasn't
 * changed.
 *
 * Mimes the bone-canvas content area shape (the sidebar + TopBar
 * already live in (app)/layout.tsx and stay mounted across nav, so
 * they don't need to flash).
 */
export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
