"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshPortalAction } from "./portal-actions";

export function RefreshNowButton({
  manatalJobId,
  initialLastSyncedAt,
}: {
  manatalJobId: number;
  initialLastSyncedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(initialLastSyncedAt);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await refreshPortalAction(manatalJobId);
      if (res.ok) {
        setLastSyncedAt(res.lastSyncedAt);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{relativeTime(lastSyncedAt)}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClick}
          disabled={pending}
          aria-label="Refresh now"
          title="Refresh this portal's cache from Manatal"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {pending ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error ? <span className="text-red-600">{error}</span> : null}
    </div>
  );
}

// Tiny relative formatter — avoids pulling in a date lib.
function relativeTime(iso: string | null): string {
  if (!iso) return "Never refreshed";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Never refreshed";
  const min = Math.round(ms / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}
