"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  type ApplicationEventRow,
  type ApplicationRow,
  type CandidateRow,
  type NoteRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { NotesSection } from "./notes-section";
import { ActivitySection } from "./activity-section";
import { TagPicker } from "./tag-picker";
import { ResumeUploader } from "./resume-uploader";
import { ParsedProfileSection } from "./parsed-profile";
import { type ParsedProfile } from "@/lib/resume-parse";

export function CandidateSlideover({
  application,
  candidate,
  stage,
  notes,
  events,
  stagesById,
  tags,
  revalidatePath,
}: {
  application: ApplicationRow;
  candidate: CandidateRow | null;
  stage: PipelineStageRow | null;
  notes: NoteRow[];
  events: ApplicationEventRow[];
  stagesById: Record<string, PipelineStageRow>;
  tags: TagRow[];
  revalidatePath: string;
}) {
  const router = useRouter();

  function close() {
    router.push("?", { scroll: false });
  }

  const name = candidate?.full_name ?? "Unknown candidate";

  return (
    <Dialog.Root open onOpenChange={(o) => (!o ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {stage ? (
                <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: stage.color ?? "#94a3b8" }}
                  />
                  {stage.name}
                </span>
              ) : (
                <span>Unstaged</span>
              )}
              <span>·</span>
              <span>{application.source}</span>
            </div>
            <Dialog.Close
              aria-label="Close"
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
                    {candidate?.email ?? "No email"}
                  </p>
                </div>
              </div>

              <Dialog.Description className="sr-only">
                Candidate details and application context
              </Dialog.Description>

              <div className="mt-6 space-y-4 text-sm">
                {candidate?.parsed_profile ? (
                  <Section label="Resume profile">
                    <ParsedProfileSection
                      profile={candidate.parsed_profile as ParsedProfile}
                    />
                  </Section>
                ) : null}
                <Section label="Notes">
                  <NotesSection
                    applicationId={application.id}
                    notes={notes}
                    revalidatePath={revalidatePath}
                  />
                </Section>
                <Section label="Activity">
                  <ActivitySection events={events} stagesById={stagesById} />
                </Section>
              </div>
            </div>

            <aside className="w-80 shrink-0 border-l border-border bg-muted/20 p-5 text-sm">
              <Field label="Email">
                {candidate?.email ?? <Empty />}
              </Field>
              <Field label="Phone">
                {candidate?.phone ?? <Empty />}
              </Field>
              <Field label="LinkedIn">
                {candidate?.linkedin_url ? (
                  <a
                    href={candidate.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-foreground hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Profile
                  </a>
                ) : (
                  <Empty />
                )}
              </Field>
              <Field label="Source">
                {candidate?.default_source ?? application.source}
              </Field>
              <Field label="Resume">
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
              <Field label="Tags">
                <TagPicker
                  entityType="application"
                  entityId={application.id}
                  appliedTags={tags}
                  revalidatePath={revalidatePath}
                />
              </Field>
              <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
                <div>Applied {new Date(application.applied_at).toLocaleString()}</div>
                <div>
                  Last change{" "}
                  {new Date(application.status_changed_at).toLocaleString()}
                </div>
              </div>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
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
  return <span className="italic text-muted-foreground">Not set</span>;
}
