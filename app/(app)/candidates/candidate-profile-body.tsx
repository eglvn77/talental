import Link from "next/link";
import {
  Briefcase,
  ExternalLink,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Sparkles,
} from "lucide-react";
import type { CandidateRow } from "@/lib/hiring";
import type { ParsedProfile } from "@/lib/resume-parse";
import { Card, CardContent } from "@/components/ui/card";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";

/**
 * Body of the candidate profile — header (avatar / name / contact /
 * source) + parsed-CV section + applications list. Rendered both by
 * the slideover that opens from /candidates and (for shareable links)
 * the standalone /candidates/[id] page.
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
}: {
  candidate: CandidateRow;
  companiesById: Record<string, CompanyChipData>;
  applications: CandidateProfileApp[];
}) {
  const profile = candidate.parsed_profile as ParsedProfile | null;
  const sourceLabel = sourceLabelFor(candidate.enrichment_source);

  return (
    <>
      <header className="mb-6 flex items-start gap-4">
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
            <p className="text-sm text-muted-foreground">{candidate.headline}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {candidate.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {candidate.location}
              </span>
            ) : null}
            {candidate.email ? (
              <a
                href={`mailto:${candidate.email}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Mail className="h-3 w-3" />
                {candidate.email}
              </a>
            ) : null}
            {candidate.phone ? (
              <a
                href={`tel:${candidate.phone}`}
                className="inline-flex items-center gap-1 font-mono hover:text-foreground"
              >
                <Phone className="h-3 w-3" />
                {candidate.phone}
              </a>
            ) : null}
            {candidate.linkedin_url ? (
              <a
                href={candidate.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Linkedin className="h-3 w-3" />
                LinkedIn
              </a>
            ) : null}
            {sourceLabel ? (
              <span className="inline-flex items-center gap-1 rounded bg-foreground/[0.05] px-1.5 py-0.5 font-mono">
                <Sparkles className="h-3 w-3 text-accent" />
                {sourceLabel}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <section className="space-y-5">
        {profile ? (
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
        )}

        <Card>
          <CardContent>
            <h2 className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              Aplicaciones
            </h2>
            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no está aplicando a ninguna vacante. Lo verás aquí
                cuando lo agregues al pipeline de una vacante.
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
                              style={{
                                background: a.stage.color ?? "#94a3b8",
                              }}
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
      </section>
    </>
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
