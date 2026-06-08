"use client";

import { useState, useTransition } from "react";
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { enrichFromLinkedinAction } from "@/app/(app)/_actions/linkedin-enrich";

/**
 * Sticky header for the slim view. Photo + name + position + location
 * + actions (open in Talental, reenrich). Designed for ~400px width.
 */
export function SlimHeader(props: {
  candidateId: string;
  fullName: string;
  headline: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
  location: string | null;
  profilePictureUrl: string | null;
  linkedinUrl: string;
  enrichmentStatus: string | null;
  enrichedAt: string | null;
}) {
  const [enriching, startEnrich] = useTransition();
  const [enrichErr, setEnrichErr] = useState<string | null>(null);

  function reenrich() {
    setEnrichErr(null);
    startEnrich(async () => {
      const res = await enrichFromLinkedinAction({
        urls: [props.linkedinUrl],
      });
      if (!res.ok) {
        setEnrichErr(res.error);
        return;
      }
      const item = res.data.results[0];
      if (item?.kind === "error") {
        setEnrichErr(item.error);
        return;
      }
      // Soft refresh — the iframe parent (side panel) can reload us.
      window.location.reload();
    });
  }

  const initials = props.fullName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg-1/95 backdrop-blur supports-[backdrop-filter]:bg-bg-1/80">
      <div className="flex items-start gap-3 px-4 py-3">
        {props.profilePictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.profilePictureUrl}
            alt={props.fullName}
            className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {initials || "?"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">
            {props.fullName}
          </h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {props.currentPosition || props.headline || "—"}
            {props.currentCompany ? (
              <span> · {props.currentCompany}</span>
            ) : null}
          </p>
          {props.location ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
              {props.location}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <a
          href={`/candidates?candidate=${props.candidateId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir en Talental
        </a>
        <button
          type="button"
          onClick={reenrich}
          disabled={enriching}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {enriching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Reenriquecer
        </button>
        {props.enrichmentStatus ? (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/60">
            {props.enrichmentStatus}
          </span>
        ) : null}
      </div>
      {enrichErr ? (
        <p className="border-t border-danger/20 bg-danger/5 px-3 py-1.5 text-xs text-danger">
          {enrichErr}
        </p>
      ) : null}
    </header>
  );
}
