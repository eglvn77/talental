import Link from "next/link";
import { ChevronRight, Tag as TagIcon } from "lucide-react";
import type { CandidateRow, TagRow, SourceRow } from "@/lib/hiring";
import type { TFunction } from "@/lib/i18n/translate";
import type { ParsedProfile } from "@/lib/resume-parse";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";
import { Card, CardContent } from "@/components/ui/card";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import {
  NotesSection,
  type NoteWithAuthor,
} from "@/app/(app)/_components/notes-section";
import { TagPicker } from "@/app/(app)/jobs/[jobId]/tag-picker";
import { ResumeUploader } from "@/app/(app)/jobs/[jobId]/resume-uploader";
import type { CustomFieldBundle } from "@/lib/custom-fields";
import { CandidateInspector } from "./candidate-inspector";
import { CandidateApplications } from "./candidate-applications";
import { ConversationsPanel } from "./_components/conversations-panel";
import type { StageOption, CandidateView } from "./load-candidate-view";
import type { CandidateProfileApp } from "./candidate-profile-body";
import type { AddToJobOption } from "./add-to-job-dialog";
import type { PortalCommentRow } from "@/lib/hiring";
import {
  ClientPortalComments,
  ClientPortalCommentsHeader,
} from "./client-portal-comments";

/**
 * Detalles tab — the candidate's working surface.
 *
 * Layout v2 (recruiter request: "split in two — conversations on one
 * side, experience on the other; contact info condensed, not a huge
 * right column"):
 *
 *   [Jobs & Applications]            ← full width, pipeline first
 *   [Client portal feedback]         ← full width, only when present
 *   ┌──────────────────┬──────────────────┐
 *   │ CONVERSACIONES   │ EXPERIENCIA      │
 *   │ latest first,    │ parsed CV        │
 *   │ click → full     │                  │
 *   │ transcript       │ ▸ Detalles       │
 *   │                  │   (inspector,    │
 *   │ Notas y tags     │   resume, custom │
 *   │                  │   fields)        │
 *   └──────────────────┴──────────────────┘
 *
 * Contact essentials (email copy / phone + WhatsApp / location) moved
 * up into the sticky candidate header; the full editable inspector
 * still exists inside the collapsed "Detalles" block on the right.
 */
export function CandidateDetalles({
  candidate,
  profile,
  companiesById,
  applications,
  stagesByJobId,
  focusApp,
  addToJobOptions,
  transcripts,
  tags,
  notes,
  portalComments,
  sources,
  customFields,
  mapsApiKey,
  revalidatePath,
  isAdmin,
  t,
}: {
  candidate: CandidateRow;
  profile: ParsedProfile | null;
  companiesById: Record<string, CompanyChipData>;
  applications: CandidateProfileApp[];
  stagesByJobId: Record<string, StageOption[]>;
  focusApp: CandidateView["focusApp"];
  addToJobOptions: AddToJobOption[];
  transcripts: import("./candidate-profile-body").TranscriptListItem[];
  tags: TagRow[];
  notes: NoteWithAuthor[];
  portalComments: Array<PortalCommentRow & { job_title: string | null }>;
  sources: SourceRow[];
  customFields: CustomFieldBundle;
  mapsApiKey: string;
  revalidatePath: string;
  isAdmin: boolean;
  t: TFunction;
}) {
  // application_id → job title, for per-call context chips in the
  // conversations panel.
  const jobTitleByApplicationId: Record<string, string> = {};
  for (const a of applications) {
    if (a.job?.title) jobTitleByApplicationId[a.id] = a.job.title;
  }

  return (
    <div className="space-y-5">
      {/* Jobs & Applications first — "where is this person in our
          pipeline" beats "what's their work history". Full width. */}
      <Card>
        <CardContent>
          <CandidateApplications
            candidateId={candidate.id}
            applications={applications}
            stagesByJobId={stagesByJobId}
            isAdmin={isAdmin}
            focusAppId={focusApp?.id ?? null}
            addToJobOptions={addToJobOptions}
            transcripts={transcripts}
          />
        </CardContent>
      </Card>

      {/* Client portal feedback — comments + 👍/👎 left by clients
          reviewing this candidate. Hidden entirely when there is
          nothing to show so it doesn't add visual noise. */}
      {portalComments.length > 0 ? (
        <Card>
          <CardContent className="space-y-3">
            <ClientPortalCommentsHeader count={portalComments.length} t={t} />
            <ClientPortalComments comments={portalComments} t={t} />
          </CardContent>
        </Card>
      ) : null}

      {/* ---- Split: conversations | experience ---- */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* LEFT — conversations (the most-used surface: latest
            interactions visible the moment the profile opens). */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardContent>
              <SectionLabel>Conversaciones</SectionLabel>
              <ConversationsPanel
                transcripts={transcripts}
                jobTitleByApplicationId={jobTitleByApplicationId}
              />
            </CardContent>
          </Card>

          {/* Candidate-level notes + tags — interactions too, so they
              live on the conversations side. */}
          <Card>
            <CardContent className="space-y-3">
              <SectionLabel icon={<TagIcon className="h-3 w-3" />}>
                {t("candidatesArea.notesAndTags")}
              </SectionLabel>
              <TagPicker
                entityType="candidate"
                entityId={candidate.id}
                appliedTags={tags}
                revalidatePath={revalidatePath}
              />
              <NotesSection
                entityType="candidate"
                entityId={candidate.id}
                notes={notes}
                isAdmin={isAdmin}
                revalidatePath={revalidatePath}
              />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — experience + collapsed details. */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardContent>
              <SectionLabel>{t("candidatesArea.tabCvProfile")}</SectionLabel>
              {profile ? (
                <ParsedProfileSection
                  profile={profile}
                  companiesById={companiesById}
                  t={t}
                />
              ) : candidate.summary ? (
                <p className="whitespace-pre-wrap text-sm text-foreground/90">
                  {candidate.summary}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("candidatesArea.noParsedProfileBefore")}{" "}
                  <Link href="/candidates/import" className="underline">
                    {t("candidatesArea.import")}
                  </Link>{" "}
                  {t("candidatesArea.noParsedProfileAfter")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Collapsed "Detalles" — the old 360px inspector column,
              condensed. Native <details> keeps this a server
              component; open it to edit contact/comp/source, resume,
              and custom fields. Essentials (email/phone/location)
              are always visible in the header chips, so this stays
              closed most of the time. */}
          <Card>
            <CardContent>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                  Detalles (contacto · compensación · CV · campos)
                </summary>
                <div className="mt-4 space-y-5">
                  <CandidateInspector
                    candidateId={candidate.id}
                    initial={{
                      email: candidate.email,
                      email_secondary: candidate.email_secondary,
                      phone: candidate.phone,
                      phone_secondary: candidate.phone_secondary,
                      linkedin_url: candidate.linkedin_url,
                      location: candidate.location,
                      location_place_id: candidate.location_place_id,
                      source_id: candidate.source_id,
                      comp_current_amount: candidate.comp_current_amount,
                      comp_current_currency: candidate.comp_current_currency,
                      comp_expected_amount: candidate.comp_expected_amount,
                      comp_expected_currency: candidate.comp_expected_currency,
                    }}
                    sources={sources}
                    mapsApiKey={mapsApiKey}
                  />
                  <div className="space-y-2">
                    <SectionLabel>{t("candidateImport.resume")}</SectionLabel>
                    <ResumeUploader
                      candidateId={candidate.id}
                      resumePath={candidate.resume_url}
                      hasParsedProfile={profile !== null}
                      revalidatePath={revalidatePath}
                    />
                  </div>
                  {customFields.definitions.length > 0 ? (
                    <div className="space-y-3">
                      <SectionLabel>
                        {t("settings.customFieldsLabel")}
                      </SectionLabel>
                      <CustomFieldsBlock
                        entityId={candidate.id}
                        definitions={customFields.definitions}
                        initialValues={customFields.valuesByDefId}
                      />
                    </div>
                  ) : null}
                </div>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </h2>
  );
}
