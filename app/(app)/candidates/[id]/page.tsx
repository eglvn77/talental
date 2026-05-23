import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  ExternalLink,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Sparkles,
} from "lucide-react";
import { hiring, type CandidateRow } from "@/lib/hiring";
import type { ParsedProfile } from "@/lib/resume-parse";
import { Card, CardContent } from "@/components/ui/card";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import { loadReferencedCompaniesForCandidate } from "@/lib/sourcing/load-companies";

export const dynamic = "force-dynamic";

/**
 * Talent-pool profile route for a single candidate. Reachable from
 * /candidates rows + from any "Ver perfil" link. Independent of
 * vacancy context — the in-job slideover at
 * /jobs/[jobId]?contact=<applicationId> still exists for when a
 * recruiter is working inside a specific role.
 */
export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await hiring();

  // 1. The candidate itself (RLS scopes to workspace).
  const { data: candidateData } = await db
    .from("candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!candidateData) notFound();
  const candidate = candidateData as CandidateRow;

  // 2. Companies referenced in parsed_profile.experience[].company_id
  //    — same loader the in-job slideover uses.
  const companiesById = await loadReferencedCompaniesForCandidate(candidate);

  // 3. Applications — show every vacancy this candidate is in, with
  //    the current stage. Same query shape as /candidates list.
  const { data: applicationsData } = await db
    .from("applications")
    .select(
      `
      id, job_id, applied_at, status_changed_at,
      stage:pipeline_stages(id, name, color),
      job:jobs(id, title, status)
      `,
    )
    .eq("candidate_id", id)
    .order("applied_at", { ascending: false });
  type RawAppRow = {
    id: string;
    job_id: string;
    applied_at: string | null;
    status_changed_at: string | null;
    // Supabase returns embedded relations as arrays even when 1:1.
    stage:
      | { id: string; name: string; color: string | null }
      | Array<{ id: string; name: string; color: string | null }>
      | null;
    job:
      | { id: string; title: string; status: string }
      | Array<{ id: string; title: string; status: string }>
      | null;
  };
  type AppRow = {
    id: string;
    job_id: string;
    applied_at: string | null;
    status_changed_at: string | null;
    stage: { id: string; name: string; color: string | null } | null;
    job: { id: string; title: string; status: string } | null;
  };
  function unwrap<T>(v: T | T[] | null | undefined): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  const applications: AppRow[] = ((applicationsData ?? []) as RawAppRow[]).map(
    (a) => ({
      id: a.id,
      job_id: a.job_id,
      applied_at: a.applied_at,
      status_changed_at: a.status_changed_at,
      stage: unwrap(a.stage),
      job: unwrap(a.job),
    }),
  );

  const profile = candidate.parsed_profile as ParsedProfile | null;
  const sourceLabel = sourceLabelFor(candidate.enrichment_source);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-4">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Candidatos
        </Link>
      </div>

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
          <h1 className="text-2xl font-semibold truncate">{candidate.full_name}</h1>
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
              desde <Link href="/candidates/import" className="underline">Importar</Link>
              {" "}o enriquece su LinkedIn desde una vacante.
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
                Aún no está aplicando a ninguna vacante. Lo verás aquí cuando
                lo agregues al pipeline de una vacante.
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
    </main>
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
