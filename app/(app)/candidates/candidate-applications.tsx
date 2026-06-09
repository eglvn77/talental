"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  moveApplicationToStageAction,
  bulkDeleteApplicationsAction,
} from "../actions";
import type { StageOption } from "./load-candidate-view";
import type {
  CandidateProfileApp,
  TranscriptListItem,
} from "./candidate-profile-body";
import { AddToJobDialog, type AddToJobOption } from "./add-to-job-dialog";
import { ApplicationShareButton } from "./_components/application-share-button";
import { SectionLabel } from "../_components/page-shell";
import { ReportPanel } from "./_components/report-panel";

const FALLBACK = "#94a3b8";

/**
 * The candidate's applications across jobs. Owns the whole card body:
 * SectionLabel + "Add to job" trigger + the dialog + the row list.
 *
 * Each row is intentionally minimal: job title (with "view in job"
 * icon on hover) + stage pill / picker on the right + admin trash.
 * Date and active-status meta were dropped — the stage already
 * communicates everything the recruiter needs at a glance.
 */
export function CandidateApplications({
  candidateId,
  applications,
  stagesByJobId,
  isAdmin,
  focusAppId,
  addToJobOptions,
  transcripts,
}: {
  candidateId: string;
  applications: CandidateProfileApp[];
  stagesByJobId: Record<string, StageOption[]>;
  isAdmin: boolean;
  focusAppId?: string | null;
  addToJobOptions: AddToJobOption[];
  /** All this candidate's transcripts. Grouped by application_id at
   *  render time so each ApplicationRow can show its own. */
  transcripts: TranscriptListItem[];
}) {
  const t = useT();
  const [addOpen, setAddOpen] = useState(false);
  // Group transcripts by application id once. Unlinked transcripts
  // (application_id NULL) are surfaced separately below.
  const transcriptsByApp: Record<string, TranscriptListItem[]> = {};
  for (const tr of transcripts) {
    if (!tr.application_id) continue;
    (transcriptsByApp[tr.application_id] ??= []).push(tr);
  }
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <SectionLabel
          icon={<Briefcase className="h-3 w-3" />}
          className="mb-0"
        >
          {t("candidatesArea.applications")}
        </SectionLabel>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("addToJob.action")}
        </button>
      </div>
      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("candidatesArea.noApplicationsYet")}
        </p>
      ) : (
        // Divide-y separates rows with a thin border — no per-row
        // chrome (border + bg + rounded) since the parent card already
        // provides the surface.
        <ul className="divide-y divide-border">
          {applications.map((a) => (
            <ApplicationRow
              key={a.id}
              app={a}
              candidateId={candidateId}
              stages={stagesByJobId[a.job_id] ?? []}
              isAdmin={isAdmin}
              focused={focusAppId === a.id}
              transcripts={transcriptsByApp[a.id] ?? []}
              defaultExpanded={focusAppId === a.id}
            />
          ))}
        </ul>
      )}
      <AddToJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidateId={candidateId}
        options={addToJobOptions}
      />
    </>
  );
}

function ApplicationRow({
  app,
  candidateId,
  stages,
  isAdmin,
  focused,
  transcripts,
  defaultExpanded,
}: {
  app: CandidateProfileApp;
  candidateId: string;
  stages: StageOption[];
  isAdmin: boolean;
  focused: boolean;
  transcripts: TranscriptListItem[];
  defaultExpanded: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  function changeStage(stageId: string) {
    if (!stageId || stageId === app.stage?.id) return;
    start(async () => {
      const res = await moveApplicationToStageAction(app.id, stageId);
      if (!res.ok) {
        toast.saveFailed(res.error);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setConfirm(false);
    start(async () => {
      const res = await bulkDeleteApplicationsAction([app.id]);
      if (!res.ok) {
        toast.actionFailed(t("jobDetail.deleteFailed"), res.error);
        return;
      }
      toast.actionOk(t("jobDetail.candidateDeleted"));
      router.refresh();
    });
  }

  return (
    // Single-row layout: job title (flex-1) + stage pill to its right
    // + admin trash. No date, no "active status" meta — the stage
    // already communicates everything at a glance. py-2.5 keeps rows
    // denser than the prior two-line layout.
    <li
      className={cn(
        "py-2.5 transition-colors",
        focused && "shadow-[inset_3px_0_0_var(--accent)] -ml-2 pl-2",
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-label={
            expanded
              ? t("candidatesArea.reportCollapse")
              : t("candidatesArea.reportExpand")
          }
          className="-ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              expanded && "rotate-90",
            )}
          />
        </button>
        <div className="min-w-0 flex-1">
          {app.job ? (
            <Link
              href={`/jobs/${app.job.id}?candidate=${candidateId}`}
              className="group inline-flex items-center gap-1 text-sm font-medium hover:text-accent"
            >
              <span className="truncate">{app.job.title}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {t("candidatesArea.deletedJob")}
            </span>
          )}
          {transcripts.length > 0 || app.candidate_report ? (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              {transcripts.length > 0 ? (
                <span>{transcripts.length} {t("candidatesArea.transcriptsShort")}</span>
              ) : null}
              {app.candidate_report ? (
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
                  {t("candidatesArea.reportBadge")}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        <div className="shrink-0">
          {stages.length > 0 ? (
            <StagePicker
              stages={stages}
              current={app.stage}
              disabled={pending}
              onChange={changeStage}
            />
          ) : app.stage ? (
            <StagePill color={app.stage.color} name={app.stage.name} />
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("candidatesArea.noStage")}
            </span>
          )}
        </div>

        {/* Public share — icon-only, between stage and admin trash.
            First click on dropdown opens menu that lazy-loads the
            current token state so we don't query for every row. */}
        <ApplicationShareButton applicationId={app.id} />

        {isAdmin ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            disabled={pending}
            aria-label={t("jobDetail.deleteFromJob")}
            title={t("jobDetail.deleteFromJob")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </div>

      {expanded ? (
        <ReportPanel
          applicationId={app.id}
          transcripts={transcripts}
          report={{
            candidate_report: app.candidate_report,
            report_generated_at: app.report_generated_at,
            report_model: app.report_model,
            report_edited_at: app.report_edited_at,
            report_inputs: app.report_inputs,
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirm}
        onOpenChange={(o) => !o && setConfirm(false)}
        title={t("jobDetail.deleteFromJob")}
        description={t("jobDetail.deleteCandidateDescription")}
        confirmLabel={t("jobDetail.delete")}
        destructive
        onConfirm={remove}
      />
    </li>
  );
}

/** Read-only colored stage badge. */
function StagePill({
  color,
  name,
}: {
  color: string | null;
  name: string;
}) {
  const c = color ?? FALLBACK;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: c + "22", color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {name}
    </span>
  );
}

/** Colored stage pill that opens a dropdown to change the stage. */
function StagePicker({
  stages,
  current,
  disabled,
  onChange,
}: {
  stages: StageOption[];
  current: { id: string; name: string; color: string | null } | null;
  disabled: boolean;
  onChange: (stageId: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const c = current?.color ?? FALLBACK;

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ background: c + "22", color: c }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
        {current?.name ?? t("candidatesArea.noStage")}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-dropdown"
        >
          {stages.map((s) => {
            const selected = s.id === current?.id;
            const sc = s.color ?? FALLBACK;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setOpen(false);
                  onChange(s.id);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  selected && "font-medium",
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: sc }}
                />
                <span className="flex-1 truncate">{s.name}</span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(t: ReturnType<typeof useT>, category: string): string {
  switch (category) {
    case "hired":
      return t("candidatesArea.statusHired");
    case "rejected":
    case "withdrawn":
      return t("candidatesArea.statusRejected");
    default:
      return t("candidatesArea.statusActive");
  }
}
