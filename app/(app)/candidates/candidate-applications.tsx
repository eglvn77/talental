"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  moveApplicationToStageAction,
  bulkDeleteApplicationsAction,
} from "../actions";
import type { StageOption } from "./load-candidate-view";
import type { CandidateProfileApp } from "./candidate-profile-body";

/**
 * The candidate's applications across jobs, with an inline stage
 * selector and a remove-from-job action per row. Shown in the unified
 * profile so a recruiter can advance a candidate in any of their
 * pipelines without leaving the panel.
 */
export function CandidateApplications({
  candidateId,
  applications,
  stagesByJobId,
  isAdmin,
}: {
  candidateId: string;
  applications: CandidateProfileApp[];
  stagesByJobId: Record<string, StageOption[]>;
  isAdmin: boolean;
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
    <ul className="divide-y divide-border">
      {applications.map((a) => (
        <ApplicationRow
          key={a.id}
          app={a}
          candidateId={candidateId}
          stages={stagesByJobId[a.job_id] ?? []}
          isAdmin={isAdmin}
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
}: {
  app: CandidateProfileApp;
  candidateId: string;
  stages: StageOption[];
  isAdmin: boolean;
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
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {app.job?.title ?? t("candidatesArea.deletedJob")}
          </span>
          {app.job ? (
            <Link
              href={`/jobs/${app.job.id}?candidate=${candidateId}`}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t("candidatesArea.viewInJob")}
              title={t("candidatesArea.viewInJob")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {app.category ? <span>{statusLabel(t, app.category)}</span> : null}
          {app.applied_at ? (
            <>
              {app.category ? <span>·</span> : null}
              <span>{app.applied_at.slice(0, 10)}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Inline stage selector for this job's pipeline */}
      {stages.length > 0 ? (
        <Select
          value={app.stage?.id ?? ""}
          onChange={changeStage}
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
          disabled={pending}
          className="w-44 shrink-0"
          searchable={stages.length > 8}
          placeholder={t("candidatesArea.noStage")}
        />
      ) : app.stage ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: app.stage.color ?? "#94a3b8" }}
          />
          {app.stage.name}
        </span>
      ) : null}

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
