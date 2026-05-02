"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type Neighbor = { slug: string; name: string } | null;

export function CandidateNav({
  portalSlug,
  prev,
  next,
}: {
  portalSlug: string;
  prev: Neighbor;
  next: Neighbor;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      if (e.key === "ArrowLeft" && prev) {
        router.push(`/p/${portalSlug}/c/${prev.slug}`);
      } else if (e.key === "ArrowRight" && next) {
        router.push(`/p/${portalSlug}/c/${next.slug}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, portalSlug, prev, next]);

  const baseBtn = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "h-8 w-8 p-0",
  );
  const disabledBtn = cn(
    baseBtn,
    "pointer-events-none cursor-not-allowed opacity-40",
  );

  return (
    <div className="flex items-center gap-2">
      {prev ? (
        <Link
          href={`/p/${portalSlug}/c/${prev.slug}`}
          className={baseBtn}
          aria-label={`Previous: ${prev.name}`}
          title={`Previous: ${prev.name}`}
        >
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span className={disabledBtn} aria-disabled="true" aria-label="No previous candidate">
          <ChevronLeft className="size-4" />
        </span>
      )}
      {next ? (
        <Link
          href={`/p/${portalSlug}/c/${next.slug}`}
          className={baseBtn}
          aria-label={`Next: ${next.name}`}
          title={`Next: ${next.name}`}
        >
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={disabledBtn} aria-disabled="true" aria-label="No next candidate">
          <ChevronRight className="size-4" />
        </span>
      )}
      <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
        ← → to navigate
      </span>
    </div>
  );
}
