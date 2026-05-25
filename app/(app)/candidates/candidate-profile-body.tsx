import Link from "next/link";
import { Briefcase, ExternalLink, Sparkles } from "lucide-react";
import type { CandidateRow } from "@/lib/hiring";
import type { NoteWithAuthor } from "@/app/(app)/_components/notes-section";
import type { ParsedProfile } from "@/lib/resume-parse";
import { Card, CardContent } from "@/components/ui/card";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import { NotesSection } from "@/app/(app)/_components/notes-section";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";
import { CandidateContactInspector } from "./candidate-contact-inspector";
import { CandidateProfileTabs } from "./candidate-profile-tabs";

/**
 * Body of the candidate profile. Rendered both by the slideover that
 * opens from /candidates and (for shareable links) the standalone
 * /candidates/[id] page.
 *
 * Layout:
 *   1. Header           — avatar + name + headline + source pill
 *   2. Contact inspector — editable email / phone / LinkedIn / location
 *                          (always visible, even when blank)
 *   3. Aplicaciones      — sits ABOVE the CV per recruiter request:
 *                          "where is this person in our pipeline"
 *                          beats "what's their work history"
 *   4. Tabs              — Perfil del CV | Notas | Conversaciones
 */
export type CandidateProfileApp = {
  id: string;
  job_id: string;
  applied_at: string | null;
  status_changed_at: string | null;
  stage: { id: string; name: string; color: string | null } | null;
  job: { id: string; title: string; status: string } | null;
};

export function CandidateProfileBody({
  candidate,
  companiesById,
  applications,
  notes,
  mapsApiKey,
  revalidatePath,
  isAdmin = false,
}: {
  candidate: CandidateRow;
  companiesById: Record<string, CompanyChipData>;
  applications: CandidateProfileApp[];
  notes: NoteWithAuthor[];
  mapsApiKey: string;
  revalidatePath: string;
  isAdmin?: boolean;
}) {
  const profile = candidate.parsed_profile as ParsedProfile | null;
  const sourceLabel = sourceLabelFor(candidate.enrichment_source);

  return (
    <div className="@container/inspector space-y-5">
      {/* ---- 1. Header (avatar + name) ---- */}
      <header className="flex items-start gap-4">
        {profile?.profile_picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.profile_picture_url}
            alt={candidate.full_name}
            className="h-16 w-16 shrink-0 rounded-full border border-border bg-card object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-medium"
          >
            {initials(candidate.full_name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">
            {candidate.full_name}
          </h1>
          {candidate.headline ? (
            <p className="text-sm text-muted-foreground">
              {candidate.headline}
            </p>
          ) : null}
          {sourceLabel ? (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-accent" />
              {sourceLabel}
            </span>
          ) : null}
        </div>
      </header>

      {/* ---- 2. Editable contact fields ---- */}
      <CandidateContactInspector
        candidateId={candidate.id}
        initial={{
          email: candidate.email,
          phone: candidate.phone,
          linkedin_url: candidate.linkedin_url,
          location: candidate.location,
          location_place_id: candidate.location_place_id,
        }}
        mapsApiKey={mapsApiKey}
      />

      {/* ---- 3. Aplicaciones (on top of CV per recruiter UX request) ---- */}
      <Card>
        <CardContent>
          <h2 className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Briefcase className="h-3 w-3" />
            Aplicaciones
          </h2>
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no está aplicando a ninguna vacante. Agrégalo al pipeline
              desde la vista de la vacante.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {applications.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.job?.title ?? "(vacante eliminada)"}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {a.stage ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: a.stage.color ?? "#94a3b8" }}
                          />
                          {a.stage.name}
                        </span>
                      ) : (
                        <span>Sin etapa</span>
                      )}
                      {a.job?.status ? (
                        <>
                          <span>·</span>
                          <span>{a.job.status}</span>
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
                      Ver en vacante
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ---- 4. Tabs: Perfil | Notas | Conversaciones (placeholder) ---- */}
      <CandidateProfileTabs
        profileSlot={
          profile ? (
            <Card>
              <CardContent>
                <ParsedProfileSection
                  profile={profile}
                  companiesById={companiesById}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-sm text-muted-foreground">
                Este candidato aún no tiene un perfil parseado. Importa su CV
                desde{" "}
                <Link href="/candidates/import" className="underline">
                  Importar
                </Link>{" "}
                o enriquece su LinkedIn desde una vacante.
              </CardContent>
            </Card>
          )
        }
        notesSlot={
          <Card>
            <CardContent>
              <NotesSection
                entityType="candidate"
                entityId={candidate.id}
                notes={notes}
                isAdmin={isAdmin}
                revalidatePath={revalidatePath}
              />
            </CardContent>
          </Card>
        }
      />
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function sourceLabelFor(source: string | null | undefined): string | null {
  if (!source) return null;
  switch (source) {
    case "cv_parse_gemini":
      return "CV parseado";
    case "dataforb2b":
      return "LinkedIn (DfB2B)";
    case "csv_import":
      return "Importado CSV";
    case "manual":
      return "Manual";
    default:
      return source;
  }
}
