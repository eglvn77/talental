import Link from "next/link";
import { Briefcase, Tag as TagIcon } from "lucide-react";
import type { CandidateRow, TagRow, SourceRow } from "@/lib/hiring";
import type { TFunction } from "@/lib/i18n/translate";
import type { ParsedProfile } from "@/lib/resume-parse";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";
import { Card, CardContent } from "@/components/ui/card";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import { CandidateReportEditor } from "./candidate-report-editor";
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
 *   Left (wider):  summary + experience/education (parsed CV) + the
 *                  Jobs & Applications subsection ("where in pipeline").
 *   Right (narrow): editable inspector (source, location, contacts,
 *                  compensation), resume, tags, and workspace custom
 *                  fields. Everything autosaves inline.
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
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* ---- Left / main column ---- */}
      <div className="min-w-0 space-y-5">
        {/* Jobs & Applications first — "where is this person in our
            pipeline" beats "what's their work history". */}
        <Card>
          <CardContent>
            {/* CandidateApplications now owns the full card body:
                SectionLabel + "Add to job" trigger + row list +
                AddToJobDialog (no separate header here anymore). */}
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
              <ClientPortalCommentsHeader
                count={portalComments.length}
                t={t}
              />
              <ClientPortalComments comments={portalComments} t={t} />
            </CardContent>
          </Card>
        ) : null}

        {/* Candidate Report — recruiter-authored summary, surfaced in
            the client portal as well. */}
        <Card>
          <CardContent>
            <CandidateReportEditor
              candidateId={candidate.id}
              initial={
                (candidate as { candidate_report?: string | null })
                  .candidate_report ?? null
              }
            />
          </CardContent>
        </Card>

        {/* CV / experience below the pipeline context. */}
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
      </div>

      {/* ---- Right / inspector column ---- */}
      <aside className="space-y-4">
        <Card>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Resume */}
        <Card>
          <CardContent className="space-y-2">
            <SectionLabel>{t("candidateImport.resume")}</SectionLabel>
            <ResumeUploader
              candidateId={candidate.id}
              resumePath={candidate.resume_url}
              hasParsedProfile={profile !== null}
              revalidatePath={revalidatePath}
            />
          </CardContent>
        </Card>

        {/* Candidate-level notes + tags — below the CV, per the
            recruiter's request. These follow the candidate across every
            vacante (not scoped to a single application). */}
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

        {/* Custom fields */}
        {customFields.definitions.length > 0 ? (
          <Card>
            <CardContent className="space-y-3">
              <SectionLabel>{t("settings.customFieldsLabel")}</SectionLabel>
              <CustomFieldsBlock
                entityId={candidate.id}
                definitions={customFields.definitions}
                initialValues={customFields.valuesByDefId}
              />
            </CardContent>
          </Card>
        ) : null}
      </aside>
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
