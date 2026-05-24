"use client";

import { useEffect, useState } from "react";
import { Kanban, List } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import { PipelineBoard } from "./pipeline-board";
import { CandidatesListView } from "./candidates-list-view";
import { StageChips } from "./_components/stage-chips";

type View = "kanban" | "list";

export function JobsView({
  jobId,
  stages,
  applications,
  candidatesById,
  tagsByApplicationId,
  workModality,
}: {
  jobId: string;
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
  tagsByApplicationId: Record<string, TagRow[]>;
  workModality: "remote" | "hybrid" | "onsite" | null;
}) {
  const storageKey = `jobs.${jobId}.view`;
  const [view, setView] = useState<View>("kanban");
  const [hydrated, setHydrated] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "list" || saved === "kanban") setView(saved);
    setHydrated(true);
  }, [storageKey]);

  function pick(v: View) {
    setView(v);
    try {
      window.localStorage.setItem(storageKey, v);
    } catch {
      /* private mode etc. — ignore */
    }
  }

  // Render kanban during SSR to match the default; swap to localStorage choice
  // only after hydration to avoid flash.
  const effective: View = hydrated ? view : "kanban";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Stage chips drive the list filter. In kanban mode each
            stage is already a column, so the chips would be visual
            noise — hide them until the user switches to list. */}
        {effective === "list" ? (
          <StageChips
            stages={stages}
            applications={applications}
            value={selectedStageId}
            onChange={setSelectedStageId}
          />
        ) : null}
        <div
          className={cn(
            "inline-flex rounded-md border border-border bg-background p-0.5",
            effective === "list" ? "ml-auto" : null,
          )}
        >
          <ToggleBtn active={effective === "kanban"} onClick={() => pick("kanban")} label="Kanban">
            <Kanban className="h-3.5 w-3.5" />
          </ToggleBtn>
          <ToggleBtn active={effective === "list"} onClick={() => pick("list")} label="Lista">
            <List className="h-3.5 w-3.5" />
          </ToggleBtn>
        </div>
      </div>

      {effective === "kanban" ? (
        <PipelineBoard
          jobId={jobId}
          stages={stages}
          applications={applications}
          candidatesById={candidatesById}
          tagsByApplicationId={tagsByApplicationId}
          workModality={workModality}
        />
      ) : (
        <CandidatesListView
          stages={stages}
          applications={applications}
          candidatesById={candidatesById}
          tagsByApplicationId={tagsByApplicationId}
          selectedStageId={selectedStageId}
        />
      )}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-foreground/[0.07] font-medium text-foreground"
          : "font-normal text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {children}
      {label}
    </button>
  );
}
