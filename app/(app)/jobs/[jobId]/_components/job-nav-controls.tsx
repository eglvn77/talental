"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** sessionStorage key matching the one jobs-table writes on row click. */
const JOB_NAV_KEY = "talental:jobNav";

type JobNavContext = {
  ids: string[];
  origin?: string;
};

/**
 * Header controls for an open job: back-to-list link plus prev/next
 * buttons + ← / → keyboard navigation through the sibling jobs the
 * user was looking at on /jobs. Mirrors the candidate-screen pattern.
 *
 * The siblings come from sessionStorage (stashed by jobs-table on row
 * click). Direct hits / shared URLs have no stash → prev/next hide.
 */
export function JobNavControls({ jobId }: { jobId: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const t = useT();
  const [nav, setNav] = useState<JobNavContext | null>(null);

  // Preserve the open tab when hopping between sibling jobs. Pathname
  // is like `/jobs/<id>` (default tab) or `/jobs/<id>/<slug>`; the
  // suffix is empty for the default tab. Recomputed on every render so
  // changing tabs and then clicking prev/next picks the right target.
  const tabSuffix = useMemo(() => {
    const base = `/jobs/${jobId}`;
    if (pathname === base) return "";
    if (pathname.startsWith(`${base}/`)) {
      const rest = pathname.slice(base.length); // includes leading "/"
      // Strip any nested segments (e.g. /jobs/X/posting/preview) down
      // to the top-level tab to be safe.
      const top = rest.split("/").filter(Boolean)[0];
      return top ? `/${top}` : "";
    }
    return "";
  }, [pathname, jobId]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(JOB_NAV_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as JobNavContext;
      if (Array.isArray(parsed.ids) && parsed.ids.length > 0) setNav(parsed);
    } catch {
      /* malformed stash — ignore */
    }
  }, []);

  const index = nav ? nav.ids.indexOf(jobId) : -1;
  const hasNav = nav !== null && index !== -1 && nav.ids.length > 1;
  const prevId = hasNav && index > 0 ? nav!.ids[index - 1]! : null;
  const nextId =
    hasNav && index < nav!.ids.length - 1 ? nav!.ids[index + 1]! : null;

  const goto = useCallback(
    (id: string | null) => {
      if (!id) return;
      router.push(`/jobs/${id}${tabSuffix}`);
    },
    [router, tabSuffix],
  );

  // ← / → arrow shortcuts. Ignore when the focus is inside an editable
  // field so typing in the kickoff prompt or status select doesn't
  // jump pages.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") {
        if (prevId) {
          e.preventDefault();
          goto(prevId);
        }
      } else if (e.key === "ArrowRight") {
        if (nextId) {
          e.preventDefault();
          goto(nextId);
        }
      } else if (e.key === "Escape") {
        // Esc returns to the jobs list. Same destination as the back
        // arrow button so the keyboard mirrors the visual affordance.
        e.preventDefault();
        router.push("/jobs");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId, goto]);

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/jobs"
        aria-label={t("jobDetail.backToJobs")}
        title={t("jobDetail.backToJobs")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      {hasNav ? (
        <>
          <button
            type="button"
            onClick={() => goto(prevId)}
            disabled={!prevId}
            aria-label={t("jobDetail.prev")}
            title={t("jobDetail.prev")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goto(nextId)}
            disabled={!nextId}
            aria-label={t("jobDetail.next")}
            title={t("jobDetail.next")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {index + 1} / {nav!.ids.length}
          </span>
        </>
      ) : null}
    </div>
  );
}
