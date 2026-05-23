"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
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
import { NotesSection } from "./notes-section";
import { ActivitySection } from "./activity-section";
import { TagPicker } from "./tag-picker";
import { ResumeUploader } from "./resume-uploader";
import { ParsedProfileSection } from "./parsed-profile";
import type { CompanyChipData } from "./page";
import { type ParsedProfile } from "@/lib/resume-parse";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { AiContextPanel } from "./ai-context-panel";

export function CandidateSlideover({
  application,
  candidate,
  stage,
  notes,
  events,
  stagesById,
  tags,
  customFieldDefinitions,
  customFieldValues,
  companiesById,
  revalidatePath,
}: {
  application: ApplicationRow;
  candidate: CandidateRow | null;
  stage: PipelineStageRow | null;
  notes: NoteRow[];
  events: ApplicationEventRow[];
  stagesById: Record<string, PipelineStageRow>;
  tags: TagRow[];
  customFieldDefinitions: CustomFieldDefinitionRow[];
  customFieldValues: Record<string, unknown>;
  companiesById: Record<string, CompanyChipData>;
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
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-modal",
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
                <span>Sin etapa</span>
              )}
              <span>·</span>
              <span>{application.source}</span>
            </div>
            <Dialog.Close
              aria-label="Cerrar"
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
                    {candidate?.email ?? "Sin correo"}
                  </p>
                </div>
              </div>

              <Dialog.Description className="sr-only">
                Detalles del candidato y de la candidatura
              </Dialog.Description>

              <div className="mt-6 space-y-4 text-sm">
                <AiContextPanel
                  applicationId={application.id}
                  initialStatus={application.ai_status_line}
                  initialSteps={application.ai_next_steps}
                  initialUpdatedAt={application.ai_context_updated_at}
                />
                {candidate?.parsed_profile ? (
                  <Section label="Perfil del CV">
                    <ParsedProfileSection
                      profile={candidate.parsed_profile as ParsedProfile}
                      companiesById={companiesById}
                    />
                  </Section>
                ) : null}
                {candidate && customFieldDefinitions.length > 0 ? (
                  <Section label="Campos personalizados">
                    <CustomFieldsBlock
                      entityId={candidate.id}
                      definitions={customFieldDefinitions}
                      initialValues={customFieldValues}
                    />
                  </Section>
                ) : null}
                <Section label="Notas">
                  <NotesSection
                    applicationId={application.id}
                    notes={notes}
                    revalidatePath={revalidatePath}
                  />
                </Section>
                <Section label="Actividad">
                  <ActivitySection events={events} stagesById={stagesById} />
                </Section>
              </div>
            </div>

            <aside className="w-80 shrink-0 border-l border-border bg-muted/20 p-5 text-sm">
              <Field label="Correo">
                {candidate?.email ?? <Empty />}
              </Field>
              <Field label="Teléfono">
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
                    Perfil
                  </a>
                ) : (
                  <Empty />
                )}
              </Field>
              <Field label="Origen">
                {candidate?.default_source ?? application.source}
              </Field>
              <Field label="CV">
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
              <Field label="Etiquetas">
                <TagPicker
                  entityType="application"
                  entityId={application.id}
                  appliedTags={tags}
                  revalidatePath={revalidatePath}
                />
              </Field>
              <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
                <div>Aplicó {new Date(application.applied_at).toLocaleString("es-MX")}</div>
                <div>
                  Último cambio{" "}
                  {new Date(application.status_changed_at).toLocaleString("es-MX")}
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
  return <span className="italic text-muted-foreground">Sin definir</span>;
}
