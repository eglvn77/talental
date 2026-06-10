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
import { CandidateApplications } from "./candidate-applications";
import { ContactStrip } from "./_components/contact-strip";
import { CompensationBlock } from "./_components/compensation-block";
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
 *   [Contact strip]                  ← full width, editable
 *   [Jobs & Applications]            ← full width, pipeline first
 *   [Client portal feedback]         ← full width, only when present
 *   ┌──────────────────┬──────────────────┐
 *   │ ▸ Details        │ EXPERIENCIA      │
 *   │   (compensation, │ parsed CV        │
 *   │   custom fields) │                  │
 *   │                  │ CV file          │
 *   │ Notas y tags     │                  │
 *   └──────────────────┴──────────────────┘
 *
 * Conversations live exclusively in the top-level Conversations tab.
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
  return (
    <div className="space-y-5">
      {/* Contact strip — THE single editable home for email / phone+
          WhatsApp / LinkedIn / location / source. Sits at the very
          top per recruiter feedback; the pencil opens the editor. */}
      <Card>
        <CardContent className="py-3">
          <ContactStrip
            candidateId={candidate.id}
            email={candidate.email}
            emailSecondary={candidate.email_secondary}
            phone={candidate.phone}
            phoneSecondary={candidate.phone_secondary}
            linkedinUrl={candidate.linkedin_url}
            location={candidate.location}
            locationPlaceId={candidate.location_place_id}
            sourceId={candidate.source_id}
            sources={sources}
            mapsApiKey={mapsApiKey}
          />
        </CardContent>
      </Card>

      {/* Jobs & Applications — "where is this person in our
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

      {/* ---- Split: details | experience ---- */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* LEFT — compensation/custom fields + notes & tags.
            (Conversations moved to their own top-level tab —
            recruiter feedback: no duplicate surface here.) */}
        <div className="min-w-0 space-y-5">
          {/* Collapsed "Details" — compensation + custom fields only.
              Contact fields live in the ContactStrip at the top of
              the tab (single home, no duplication). Native <details>
              keeps this a server component. */}
          <Card>
            <CardContent>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                  {t("candidatesArea.detailsAccordionTitle")}
                </summary>
                <div className="mt-4 space-y-5">
                  <CompensationBlock
                    candidateId={candidate.id}
                    compCurrentAmount={candidate.comp_current_amount}
                    compCurrentCurrency={candidate.comp_current_currency}
                    compExpectedAmount={candidate.comp_expected_amount}
                    compExpectedCurrency={candidate.comp_expected_currency}
                  />
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

          {/* Candidate-level notes + tags. */}
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

          {/* CV — its own section (used to hide inside the Detalles
              accordion, which made the uploaded file hard to find). */}
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
