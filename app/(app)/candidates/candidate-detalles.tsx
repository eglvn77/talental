import Link from "next/link";
import { Briefcase, ExternalLink, Tag as TagIcon } from "lucide-react";
import type { CandidateRow, TagRow, SourceRow } from "@/lib/hiring";
import type { TFunction } from "@/lib/i18n/translate";
import type { ParsedProfile } from "@/lib/resume-parse";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";
import { Card, CardContent } from "@/components/ui/card";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { TagPicker } from "@/app/(app)/jobs/[jobId]/tag-picker";
import { ResumeUploader } from "@/app/(app)/jobs/[jobId]/resume-uploader";
import type { CustomFieldBundle } from "@/lib/custom-fields";
import { CandidateInspector } from "./candidate-inspector";
import type { CandidateProfileApp } from "./candidate-profile-body";

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
  tags,
  sources,
  customFields,
  mapsApiKey,
  revalidatePath,
  t,
}: {
  candidate: CandidateRow;
  profile: ParsedProfile | null;
  companiesById: Record<string, CompanyChipData>;
  applications: CandidateProfileApp[];
  tags: TagRow[];
  sources: SourceRow[];
  customFields: CustomFieldBundle;
  mapsApiKey: string;
  revalidatePath: string;
  t: TFunction;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      {/* ---- Left / main column ---- */}
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

        {/* Jobs & Applications */}
        <Card>
          <CardContent>
            <SectionLabel icon={<Briefcase className="h-3 w-3" />}>
              {t("candidatesArea.applications")}
            </SectionLabel>
            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("candidatesArea.noApplicationsYet")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {applications.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {a.job?.title ?? t("candidatesArea.deletedJob")}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {a.stage ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: a.stage.color ?? "#94a3b8" }}
                            />
                            {a.stage.name}
                          </span>
                        ) : (
                          <span>{t("candidatesArea.noStage")}</span>
                        )}
                        {a.category ? (
                          <>
                            <span>·</span>
                            <span>{statusLabel(t, a.category)}</span>
                          </>
                        ) : null}
                        {a.applied_at ? (
                          <>
                            <span>·</span>
                            <span>{formatDate(a.applied_at)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {a.job ? (
                      <Link
                        href={`/jobs/${a.job.id}?contact=${a.id}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        scroll={false}
                      >
                        {t("candidatesArea.viewInJob")}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
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

        {/* Tags */}
        <Card>
          <CardContent className="space-y-2">
            <SectionLabel icon={<TagIcon className="h-3 w-3" />}>
              {t("settings.tagsLabel")}
            </SectionLabel>
            <TagPicker
              entityType="candidate"
              entityId={candidate.id}
              appliedTags={tags}
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

function statusLabel(t: TFunction, category: string): string {
  // Collapse the fine-grained pipeline_category into the recruiter-
  // facing active / hired / rejected the spec asks for.
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

function formatDate(iso: string): string {
  // Stable, locale-agnostic YYYY-MM-DD to avoid SSR/CSR drift.
  return iso.slice(0, 10);
}
