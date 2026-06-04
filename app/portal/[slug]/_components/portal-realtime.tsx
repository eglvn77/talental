"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Real-time-ish refresh for the portal. Polls every `intervalMs` and
 * calls `router.refresh()`. We don't use Supabase Realtime channels
 * here because the portal tables are service_role only — opening them
 * to anon would expand the trust boundary. Polling has zero auth
 * surface and gives the client a perceived live view of stage moves
 * and other viewers' comments.
 *
 * The poll is paused while the tab is hidden (visibilitychange) so
 * background tabs don't keep hammering the server.
 */
export function PortalRealtime({
  intervalMs = 12_000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function start() {
      stop();
      timer = setInterval(() => router.refresh(), intervalMs);
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        // Catch up immediately on tab focus, then resume polling.
        router.refresh();
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [router, intervalMs]);
  return null;
}
