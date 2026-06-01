import "server-only";
import {
  type CustomFieldDefinitionRow,
  type JobRow,
} from "@/lib/hiring";
import {
  loadCustomFieldsForEntity,
  type CustomFieldBundle,
} from "@/lib/custom-fields";

/**
 * The shape Kickoff/Calibrar consumes. Two fields come from columns
 * on `jobs` (`role_type` + `assessment_link`); the rest come from
 * the workspace's `job` custom field values, looked up by the seeded
 * keys. Anything not yet set falls back to safe defaults so a fresh
 * vacante that hasn't been configured still produces a runnable
 * setupAnswers payload.
 */
export type JobRoleConfig = {
  jdLanguage: "es" | "en";
  outreachLanguage: "es" | "en";
  aiProcessLanguage: "es" | "en" | null;
  includeSalaryInPost: boolean;
  includeCompanyInPost: boolean;
  useEmojisInJd: boolean;
  createAssessment: boolean;
  assessmentLink: string | null;
};

const DEFAULTS = {
  jdLanguage: "es" as const,
  outreachLanguage: "es" as const,
  aiProcessLanguage: null,
  includeSalaryInPost: false,
  includeCompanyInPost: false,
  useEmojisInJd: true,
  createAssessment: false,
};

/**
 * Map the workspace's "Idioma JD" select value to a language code.
 * Accepts the seeded Spanish labels ("Inglés"/"Español"), English
 * labels, and raw codes — so it's robust to however the admin named
 * the options. This single value drives the WHOLE package language
 * (JD, outreach, application/AI questions), per Emanuel's intent.
 */
function mapPackageLanguage(v: unknown): "es" | "en" | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "en" || s === "english" || s.startsWith("ing")) return "en";
  if (s === "es" || s === "spanish" || s.startsWith("esp")) return "es";
  return null;
}

function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * Build a JobRoleConfig from the job row + the workspace's job
 * custom field values. Server-only — uses the auth-aware Supabase
 * client; RLS scopes definitions/values to the workspace.
 *
 * Accepts an optional pre-loaded custom-fields bundle so callers
 * that also need `loadRequiredJobCustomFieldsMissing` can read the
 * tables once and pass the result to both helpers — avoids a
 * duplicated `loadCustomFieldsForEntity` call (=2 DB round-trips
 * saved per page load).
 */
export async function loadJobRoleConfig(
  job: JobRow,
  preloadedFields?: CustomFieldBundle,
): Promise<JobRoleConfig> {
  const { definitions, valuesByDefId } =
    preloadedFields ?? (await loadCustomFieldsForEntity("job", job.id));

  // Index by key so we can pull each seeded role-config field by name.
  const byKey: Record<string, unknown> = {};
  for (const d of definitions) {
    const v = valuesByDefId[d.id];
    if (v !== undefined) byKey[d.key] = v;
  }

  // One language field ("Idioma JD") drives the whole package. Falls
  // back to a legacy jd_language key, then the default.
  const pkgLang =
    mapPackageLanguage(byKey.idioma_jd) ??
    mapPackageLanguage(byKey.jd_language) ??
    DEFAULTS.jdLanguage;

  return {
    jdLanguage: pkgLang,
    outreachLanguage: pkgLang,
    aiProcessLanguage: pkgLang,
    includeSalaryInPost:
      asBool(byKey.include_salary_in_post) ?? DEFAULTS.includeSalaryInPost,
    includeCompanyInPost:
      asBool(byKey.include_company_in_post) ?? DEFAULTS.includeCompanyInPost,
    // Emojis in the JD are OFF by policy (no longer optional). Ignore any
    // legacy `use_emojis_in_jd` custom field and always send false.
    useEmojisInJd: false,
    createAssessment:
      asBool(byKey.create_assessment) ?? DEFAULTS.createAssessment,
    assessmentLink: job.assessment_link,
  };
}

/**
 * Returns the workspace's `job` custom field definitions flagged
 * `is_required = true` that don't yet have a value on this job.
 * Kickoff/Calibrar uses this to block submit until they're filled —
 * the user gets a banner pointing back to Ajustes → Campos
 * personalizados to set them.
 *
 * Accepts an optional pre-loaded custom-fields bundle. Pair with
 * `loadJobRoleConfig(job, preloaded)` to share one DB read across
 * both helpers — see the job layout's parallelized loader.
 */
export async function loadRequiredJobCustomFieldsMissing(
  jobId: string,
  preloadedFields?: CustomFieldBundle,
): Promise<CustomFieldDefinitionRow[]> {
  const { definitions, valuesByDefId } =
    preloadedFields ?? (await loadCustomFieldsForEntity("job", jobId));
  return definitions.filter((d) => {
    if (!d.is_required) return false;
    const v = valuesByDefId[d.id];
    if (v === undefined || v === null) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}
