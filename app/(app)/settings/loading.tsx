import { Skeleton } from "@/components/ui/skeleton";

/**
 * Settings cluster — sidebar nav + content. The nav stays mounted
 * (it's part of /settings/layout.tsx) so this only fills the
 * content pane.
 */
export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-10">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-6 h-4 w-80" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-md border border-border bg-card p-4"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
