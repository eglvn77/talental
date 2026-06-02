"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  moveApplicationToStageAction,
  bulkDeleteApplicationsAction,
} from "../actions";
import type { StageOption } from "./load-candidate-view";
import type { CandidateProfileApp } from "./candidate-profile-body";

const FALLBACK = "#94a3b8";

/**
 * The candidate's applications across jobs. Each is a compact card:
 * job title, status + date, and a colored stage pill that doubles as
 * an inline stage selector. Admin-only remove-from-job. (AI context is
 * intentionally omitted until the feature is enabled.)
 */
export function CandidateApplications({
  candidateId,
  applications,
  stagesByJobId,
  isAdmin,
  focusAppId,
}: {
  candidateId: string;
  applications: CandidateProfileApp[];
  stagesByJobId: Record<string, StageOption[]>;
  isAdmin: boolean;
  focusAppId?: string | null;
}) {
  const t = useT();
  if (applications.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("candidatesArea.noApplicationsYet")}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {applications.map((a) => (
        <ApplicationRow
          key={a.id}
          app={a}
          candidateId={candidateId}
          stages={stagesByJobId[a.job_id] ?? []}
          isAdmin={isAdmin}
          focused={focusAppId === a.id}
        />
      ))}
    </ul>
  );
}

function ApplicationRow({
  app,
  candidateId,
  stages,
  isAdmin,
  focused,
}: {
  app: CandidateProfileApp;
  candidateId: string;
  stages: StageOption[];
  isAdmin: boolean;
  focused: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

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
    <li
      className={cn(
        "rounded-lg border bg-card p-3 transition-colors",
        focused ? "border-accent/40 ring-1 ring-accent/30" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {app.job ? (
            <Link
              href={`/jobs/${app.job.id}?candidate=${candidateId}`}
              className="group inline-flex items-start gap-1 text-sm font-medium hover:text-accent"
            >
              <span className="break-words">{app.job.title}</span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {t("candidatesArea.deletedJob")}
            </span>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {app.category ? <span>{statusLabel(t, app.category)}</span> : null}
            {app.applied_at ? (
              <>
                {app.category ? <span aria-hidden>·</span> : null}
                <span>{app.applied_at.slice(0, 10)}</span>
              </>
            ) : null}
          </div>
        </div>

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

      <div className="mt-2">
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
