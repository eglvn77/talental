"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { PortalPipeline } from "@/lib/portal/load-pipeline";
import { PortalCandidateCard } from "./portal-candidate-card";

type ViewMode = "kanban" | "table";

export function PortalKanban({
  slug,
  pipeline,
  viewerEmail,
}: {
  slug: string;
  pipeline: PortalPipeline;
  viewerEmail: string;
}) {
  const t = useT();
  const [view, setView] = useState<ViewMode>("kanban");
  const { stages, applications, candidatesById } = pipeline;

  // Group applications by stage_id for fast column rendering.
  const byStage: Record<string, typeof applications> = {};
  for (const a of applications) {
    const sid = a.stage_id ?? "";
    (byStage[sid] ??= []).push(a);
  }

  // Rejected starts collapsed (clients usually skim it last). Everything
  // else open. State is keyed by stage_id; user clicks toggle a column.
  const initialCollapsed = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const s of stages) {
      if (s.category === "rejected") m[s.id] = true;
    }
    return m;
  }, [stages]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    initialCollapsed,
  );
  function toggle(stageId: string) {
    setCollapsed((c) => ({ ...c, [stageId]: !c[stageId] }));
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("portal.candidatesCount", { n: applications.length })}
        </p>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {stages.length === 0 ? (
        <p className="rounded border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          {t("portal.noCandidates")}
        </p>
      ) : view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((s) => {
            const apps = byStage[s.id] ?? [];
            const isCollapsed = collapsed[s.id] ?? false;
            return (
              <section
                key={s.id}
                className={cn(
                  "flex h-[calc(100vh-200px)] shrink-0 flex-col rounded-md border border-border bg-bg-2 transition-all",
                  isCollapsed ? "w-10" : "w-72",
                )}
              >
                <header
                  className={cn(
                    "flex items-center gap-2 border-b border-border",
                    isCollapsed ? "flex-col gap-1 px-1 py-2" : "px-3 py-2",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-label={isCollapsed ? "Expand" : "Collapse"}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronLeft className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {isCollapsed ? (
                    <>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.color || "#888" }}
                        aria-hidden
                      />
                      <span className="rotate-180 text-[10px] font-semibold uppercase tracking-wide [writing-mode:vertical-rl]">
                        {s.name}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {apps.length}
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.color || "#888" }}
                        aria-hidden
                      />
                      <span className="truncate text-xs font-semibold">
                        {s.name}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                        {apps.length}
                      </span>
                    </>
                  )}
                </header>
                {isCollapsed ? null : (
                  <div className="flex-1 space-y-2 overflow-y-auto p-2">
                    {apps.map((a) => {
                      const c = candidatesById[a.candidate_id];
                      if (!c) return null;
                      return (
                        <Link
                          key={a.id}
                          href={`/portal/${slug}/c/${c.id}?app=${a.id}`}
                          className="block"
                        >
                          <PortalCandidateCard
                            candidate={c}
                            settings={pipeline.settings}
                            stageColor={s.color}
                          />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <PortalTable
          slug={slug}
          pipeline={pipeline}
          byStage={byStage}
        />
      )}
      {/* viewerEmail is wired here so commit 4 can pass it to comment posting without re-plumbing. */}
      <input type="hidden" data-viewer-email value={viewerEmail} readOnly />
    </main>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-0.5 rounded border border-border bg-bg-2 p-0.5">
      <button
        type="button"
        onClick={() => onChange("kanban")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs",
          view === "kanban"
            ? "bg-background font-medium"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={view === "kanban"}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        {t("portal.viewKanban")}
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs",
          view === "table"
            ? "bg-background font-medium"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={view === "table"}
      >
        <List className="h-3.5 w-3.5" />
        {t("portal.viewTable")}
      </button>
    </div>
  );
}

/** Minimal table — populated for real in commit 4. */
function PortalTable({
  slug,
  pipeline,
  byStage,
}: {
  slug: string;
  pipeline: PortalPipeline;
  byStage: Record<string, typeof pipeline.applications>;
}) {
  const t = useT();
  const { stages, candidatesById } = pipeline;
  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-2">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t("portal.profile")}</th>
            <th className="px-3 py-2">{t("jobTabs.candidates")}</th>
            <th className="px-3 py-2">Stage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {stages.flatMap((s) =>
            (byStage[s.id] ?? []).map((a) => {
              const c = candidatesById[a.candidate_id];
              if (!c) return null;
              return (
                <tr key={a.id} className="hover:bg-foreground/[0.02]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/portal/${slug}/c/${c.id}?app=${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.current_position ?? ""}
                    {c.current_company_name ? (
                      <span className="text-[11px]"> · {c.current_company_name}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px]"
                      style={{
                        backgroundColor: (s.color || "#888") + "22",
                        color: s.color || undefined,
                      }}
                    >
                      {s.name}
                    </span>
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}
