import { type ParsedProfile } from "@/lib/resume-parse";
import { computeTenure, formatMonths } from "@/lib/tenure";
import { cn } from "@/lib/utils";
import type { TFunction } from "@/lib/i18n/translate";
import { SummaryCollapse } from "./summary-collapse";
import { CompanyChip, type CompanyChipData } from "./company-chip";
import { LogoImg } from "./logo-img";

/**
 * Renders a candidate's structured profile (PDF parse or LinkedIn
 * enrich). Both sources share the ParsedProfile shape; LinkedIn
 * profiles additionally carry logo URLs + duration_months which we
 * surface when present.
 *
 * Layout: collapsible summary → tenure summary block → experience
 * timeline → education → skills → languages.
 */
export function ParsedProfileSection({
  profile,
  companiesById,
  t,
}: {
  profile: ParsedProfile;
  companiesById?: Record<string, CompanyChipData>;
  /**
   * Translator. This component has no "use client" directive but is
   * rendered from both server and client trees, so it takes `t` as a
   * prop instead of calling a hook. Server callers pass `await getT()`,
   * client callers pass `useT()`.
   */
  t: TFunction;
}) {
  const tenure = computeTenure(profile.experience);

  return (
    <div className="space-y-4 text-sm">
      {profile.summary ? <SummaryCollapse text={profile.summary} /> : null}

      {tenure.has_durations && tenure.company_count > 1 ? (
        <TenureSummary
          totalMonths={tenure.total_months}
          avgMonths={tenure.avg_months}
          t={t}
        />
      ) : null}

      {profile.experience.length > 0 ? (
        <Block label={t("shared.profileExperience")}>
          <ul className="space-y-3">
            {profile.experience.map((e, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <LogoOrInitial
                  src={e.company_logo_url}
                  alt={e.company}
                  fallbackText={e.company}
                  variant="square"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{e.title}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {[e.start_date, e.end_date].filter(Boolean).join(" – ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <CompanyChip
                      name={e.company}
                      companyId={e.company_id}
                      data={
                        e.company_id ? companiesById?.[e.company_id] : undefined
                      }
                    />
                    {e.location ? <span>· {e.location}</span> : null}
                    {e.duration_months && e.duration_months > 0 ? (
                      <span>· {formatMonths(e.duration_months, t)}</span>
                    ) : null}
                    {e.is_current ? (
                      <span className="ml-0.5 rounded bg-accent/15 px-1 py-px text-[9px] uppercase tracking-wide text-accent">
                        {t("shared.profileCurrent")}
                      </span>
                    ) : null}
                  </div>
                  {e.description ? (
                    <div className="mt-1.5">
                      <SummaryCollapse text={e.description} lines={6} size="xs" />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {profile.education.length > 0 ? (
        <Block label={t("shared.profileEducation")}>
          <ul className="space-y-2">
            {profile.education.map((e, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <LogoOrInitial
                  src={e.school_logo_url}
                  alt={e.school}
                  fallbackText={e.school}
                  variant="circle"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{e.school}</div>
                  <div className="text-xs text-muted-foreground">
                    {[e.degree, e.field].filter(Boolean).join(", ")}
                    {e.start_year || e.end_year
                      ? ` · ${[e.start_year, e.end_year].filter(Boolean).join(" – ")}`
                      : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {profile.skills.length > 0 ? (
        <Block label={t("shared.profileSkills")}>
          <div className="flex flex-wrap gap-1">
            {profile.skills.map((s) => (
              <span
                key={s}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
              >
                {s}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {profile.languages.length > 0 ? (
        <Block label={t("shared.profileLanguages")}>
          <div className="flex flex-wrap gap-1">
            {profile.languages.map((l) => (
              <span
                key={l}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
              >
                {l}
              </span>
            ))}
          </div>
        </Block>
      ) : null}
    </div>
  );
}

function TenureSummary({
  totalMonths,
  avgMonths,
  t,
}: {
  totalMonths: number;
  avgMonths: number;
  t: TFunction;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
      <dl className="grid grid-cols-2 gap-3 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("shared.tenureAvgPerCompany")}
          </dt>
          <dd className="text-sm font-medium text-foreground">
            {formatMonths(avgMonths, t)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("shared.tenureTotal")}
          </dt>
          <dd className="text-sm font-medium text-foreground">
            {formatMonths(totalMonths, t)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      {children}
    </div>
  );
}

/**
 * 28px square (companies) or circle (schools). Falls back to initial
 * + neutral background when no logo URL is available — keeps the
 * layout consistent between LinkedIn-enriched and PDF-parsed
 * candidates without forcing an empty placeholder.
 */
function LogoOrInitial({
  src,
  alt,
  fallbackText,
  variant,
}: {
  src?: string;
  alt: string;
  fallbackText: string;
  variant: "square" | "circle";
}) {
  const radius = variant === "square" ? "rounded" : "rounded-full";
  if (src) {
    // Client leaf — the onError fallback can't live in a Server
    // Component (this section renders server-side on /candidates/[id]).
    return (
      <LogoImg
        src={src}
        alt={alt}
        className={cn(
          "mt-0.5 h-7 w-7 shrink-0 border border-border bg-card object-cover",
          radius,
        )}
      />
    );
  }
  const initial = fallbackText?.[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-muted text-[10px] font-medium text-muted-foreground",
        radius,
      )}
    >
      {initial}
    </span>
  );
}
