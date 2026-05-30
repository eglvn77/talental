"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Trash2, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { bulkDeleteApplicationsAction } from "../../actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  type ApplicationEventRow,
  type ApplicationRow,
  type CandidateRow,
  type CustomFieldDefinitionRow,
  type NoteRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import { cn } from "@/lib/utils";
import {
  NotesSection,
  type NoteWithAuthor,
} from "@/app/(app)/_components/notes-section";
import { ActivitySection } from "./activity-section";
import { TagPicker } from "./tag-picker";
import { ResumeUploader } from "./resume-uploader";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";
import { type ParsedProfile } from "@/lib/resume-parse";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { AiContextPanel } from "./ai-context-panel";

export function CandidateSlideover({
  application,
  candidate,
  stage,
  rejectionReasonName,
  notes,
  events,
  stagesById,
  tags,
  customFieldDefinitions,
  customFieldValues,
  companiesById,
  revalidatePath,
  isAdmin = false,
}: {
  application: ApplicationRow;
  candidate: CandidateRow | null;
  stage: PipelineStageRow | null;
  /** Pretty name of `application.rejection_reason_id` for display in
   *  the header chip. Null when the application isn't rejected or
   *  hasn't had a reason picked yet. */
  rejectionReasonName?: string | null;
  notes: NoteWithAuthor[];
  events: ApplicationEventRow[];
  stagesById: Record<string, PipelineStageRow>;
  tags: TagRow[];
  customFieldDefinitions: CustomFieldDefinitionRow[];
  customFieldValues: Record<string, unknown>;
  companiesById: Record<string, CompanyChipData>;
  revalidatePath: string;
  /** Gates the delete affordance on each note. Defaults false. */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

  function close() {
    router.push("?", { scroll: false });
  }

  function onConfirmDelete() {
    startDelete(async () => {
      const res = await bulkDeleteApplicationsAction([application.id]);
      if (!res.ok) {
        toast.actionFailed(t("jobDetail.deleteFailed"), res.error);
        return;
      }
      toast.actionOk(t("jobDetail.candidateDeleted"));
      setConfirmDelete(false);
      // Close slideover then refresh so the kanban/list re-renders
      // without the removed application.
      router.push("?", { scroll: false });
      router.refresh();
    });
  }

  const name = candidate?.full_name ?? t("jobDetail.unknownCandidate");

  return (
    <Dialog.Root open onOpenChange={(o) => (!o ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-modal",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {stage ? (
                <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: stage.color ?? "#94a3b8" }}
                  />
                  {stage.name}
                </span>
              ) : (
                <span>{t("jobDetail.noStage")}</span>
              )}
              {/* Rejection reason chip — only when the application
                  is actually in a rejected stage AND a reason has
                  been picked. Wine on light-wine so it reads as
                  "this candidate is out, and here's why" at a glance. */}
              {stage?.category === "rejected" && rejectionReasonName ? (
                <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-2 py-0.5 text-danger">
                  {rejectionReasonName}
                </span>
              ) : null}
              <span>·</span>
              <span>{application.source}</span>
            </div>
            <Dialog.Close
              aria-label={t("jobDetail.close")}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-base font-medium"
                  aria-hidden
                >
                  {name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? "")
                    .join("") || "?"}
                </span>
                <div>
                  <Dialog.Title className="text-xl font-semibold">
                    {name}
                  </Dialog.Title>
                  <p className="text-sm text-muted-foreground">
                    {candidate?.email ?? t("jobDetail.noEmail")}
                  </p>
                </div>
              </div>

              <Dialog.Description className="sr-only">
                {t("jobDetail.slideoverDescription")}
              </Dialog.Description>

              <div className="mt-6 space-y-4 text-sm">
                <AiContextPanel
                  applicationId={application.id}
                  initialStatus={application.ai_status_line}
                  initialSteps={application.ai_next_steps}
                  initialUpdatedAt={application.ai_context_updated_at}
                />
                {candidate?.parsed_profile ? (
                  <Section label={t("jobDetail.sectionResumeProfile")}>
                    <ParsedProfileSection
                      profile={candidate.parsed_profile as ParsedProfile}
                      companiesById={companiesById}
                      t={t}
                    />
                  </Section>
                ) : null}
                {candidate && customFieldDefinitions.length > 0 ? (
                  <Section label={t("jobDetail.sectionCustomFields")}>
                    <CustomFieldsBlock
                      entityId={candidate.id}
                      definitions={customFieldDefinitions}
                      initialValues={customFieldValues}
                    />
                  </Section>
                ) : null}
                <Section label={t("jobDetail.sectionNotes")}>
                  <NotesSection
                    entityType="application"
                    entityId={application.id}
                    notes={notes}
                    isAdmin={isAdmin}
                    revalidatePath={revalidatePath}
                  />
                </Section>
                <Section label={t("jobDetail.sectionActivity")}>
                  <ActivitySection events={events} stagesById={stagesById} />
                </Section>
              </div>
            </div>

            <aside className="w-80 shrink-0 border-l border-border bg-muted/20 p-5 text-sm">
              <Field label={t("jobDetail.fieldEmail")}>
                {candidate?.email ?? <Empty />}
              </Field>
              <Field label={t("jobDetail.fieldPhone")}>
                {candidate?.phone ?? <Empty />}
              </Field>
              <Field label={t("jobDetail.fieldLinkedin")}>
                {candidate?.linkedin_url ? (
                  <a
                    href={candidate.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-foreground hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("jobDetail.linkedinProfile")}
                  </a>
                ) : (
                  <Empty />
                )}
              </Field>
              <Field label={t("jobDetail.fieldSource")}>
                {candidate?.default_source ?? application.source}
              </Field>
              <Field label={t("jobDetail.fieldResume")}>
                {candidate ? (
                  <ResumeUploader
                    candidateId={candidate.id}
                    resumePath={candidate.resume_url}
                    hasParsedProfile={Boolean(candidate.parsed_profile)}
                    revalidatePath={revalidatePath}
                  />
                ) : (
                  <Empty />
                )}
              </Field>
              <Field label={t("jobDetail.fieldTags")}>
                <TagPicker
                  entityType="application"
                  entityId={application.id}
                  appliedTags={tags}
                  revalidatePath={revalidatePath}
                />
              </Field>
              <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
                <div>
                  {t("jobDetail.appliedAt", {
                    date: new Date(application.applied_at).toLocaleString("es-MX"),
                  })}
                </div>
                <div>
                  {t("jobDetail.lastChange", {
                    date: new Date(application.status_changed_at).toLocaleString("es-MX"),
                  })}
                </div>
              </div>

              {/* Admin-only destructive action. Lives at the bottom of
                  the aside so the recruiter has to scroll past every
                  detail before reaching it — keeps it discoverable but
                  not accidentally clickable. */}
              {isAdmin ? (
                <div className="mt-4 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    {deleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {t("jobDetail.deleteFromJob")}
                  </button>
                </div>
              ) : null}
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => (!o ? setConfirmDelete(false) : null)}
        title={t("jobDetail.deleteCandidateTitle", { name })}
        description={t("jobDetail.deleteCandidateDescription")}
        confirmLabel={t("jobDetail.delete")}
        destructive
        onConfirm={() => onConfirmDelete()}
      />
    </Dialog.Root>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Empty() {
  const t = useT();
  return (
    <span className="italic text-muted-foreground">
      {t("jobDetail.fieldUndefined")}
    </span>
  );
}
