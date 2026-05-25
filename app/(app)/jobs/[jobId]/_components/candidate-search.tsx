"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListNav } from "@/lib/use-list-nav";
import type {
  ApplicationRow,
  CandidateRow,
  PipelineStageRow,
} from "@/lib/hiring";

const MAX_RESULTS = 12;

type Result = {
  app: ApplicationRow;
  cand: CandidateRow | null;
  stage: PipelineStageRow | null;
};

/**
 * In-vacante candidate finder. Replaces the previous "filter the
 * pipeline by text" behavior with a standalone autocomplete: the user
 * types in the search box, matches drop down below it, and clicking
 * a result opens the candidate slideover (?contact=<applicationId>).
 *
 * The underlying kanban + list views no longer filter on this string
 * — the search is a *finder*, not a filter. That way you can keep
 * looking at the full board while jumping to specific candidates.
 *
 * Trigger collapses to a magnifier icon until clicked, matching the
 * other vacante chrome buttons (Filtros / Vista / kebab). Click-out
 * + the input's blur both dismiss the results panel.
 */
export function CandidateSearch({
  value,
  onChange,
  applications,
  candidatesById,
  stagesById,
  recent,
  onRecordSearch,
  onClearHistory,
}: {
  value: string;
  onChange: (v: string) => void;
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
  stagesById: Record<string, PipelineStageRow>;
  /** Recent searches for the empty-state dropdown panel. */
  recent?: string[];
  /** Record the current query right before navigation. */
  onRecordSearch?: (q: string) => void;
  /** Wipe history (renders the "Limpiar" link in the recent panel). */
  onClearHistory?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(value.length > 0);
  const expanded = focused || value.length > 0;
  const q = value.trim().toLowerCase();

  // Click-outside closes the results panel without clearing the query.
  useEffect(() => {
    if (!resultsOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setResultsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [resultsOpen]);

  const results: Result[] = useMemo(() => {
    if (q.length === 0) return [];
    const out: Result[] = [];
    for (const a of applications) {
      const c = candidatesById[a.candidate_id] ?? null;
      const hay =
        (c?.full_name ?? "").toLowerCase() +
        " " +
        (c?.email ?? "").toLowerCase() +
        " " +
        (c?.linkedin_url ?? "").toLowerCase();
      if (!hay.includes(q)) continue;
      out.push({
        app: a,
        cand: c,
        stage: a.stage_id ? stagesById[a.stage_id] ?? null : null,
      });
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }, [applications, candidatesById, stagesById, q]);

  function openResult(applicationId: string) {
    setResultsOpen(false);
    setFocused(false);
    onRecordSearch?.(value);
    router.push(`?contact=${applicationId}`, { scroll: false });
  }

  // Keyboard nav: ↑/↓ moves highlight, Enter picks. Reset on results change.
  const { highlight, setHighlight, onKeyDown: navKeys } = useListNav(
    results,
    (r) => openResult(r.app.id),
  );

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setFocused(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label="Buscar candidato"
        title="Buscar candidato"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative inline-flex h-8 items-center"
    >
      <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setResultsOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          // Open on focus so the recents panel can show even with an
          // empty query — the body conditionally renders recents vs
          // matches vs empty.
          setResultsOpen(true);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setResultsOpen(false);
            inputRef.current?.blur();
            return;
          }
          navKeys(e);
        }}
        aria-label="Buscar candidato"
        placeholder="Buscar candidato…"
        className="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-7 text-xs"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setResultsOpen(false);
            inputRef.current?.focus();
          }}
          aria-label="Limpiar búsqueda"
          className="absolute right-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}

      {resultsOpen ? (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
          {q.length === 0 ? (
            // Empty query → show recent searches if we have any.
            recent && recent.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>Recientes</span>
                  {onClearHistory ? (
                    <button
                      type="button"
                      onClick={onClearHistory}
                      className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground hover:text-foreground"
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>
                <ul className="max-h-[60vh] overflow-y-auto pb-1">
                  {recent.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(r);
                          inputRef.current?.focus();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/60"
                      >
                        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                Empieza a escribir para buscar candidatos.
              </div>
            )
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              Sin candidatos que coincidan.
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={r.app.id}>
                  <button
                    type="button"
                    onClick={() => openResult(r.app.id)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                      i === highlight ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {r.cand?.full_name ?? "Sin nombre"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[r.cand?.email, r.stage?.name]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                    {r.stage ? (
                      <span
                        className="ml-2 mt-0.5 inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{
                          background: (r.stage.color ?? "#94a3b8") + "22",
                          color: r.stage.color ?? "#475569",
                        }}
                      >
                        {r.stage.name}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
