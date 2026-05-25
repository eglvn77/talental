import "server-only";
import {
  type CustomFieldDefinitionRow,
  type JobRow,
} from "@/lib/hiring";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";

/**
 * The shape Kickoff/Calibrar consumes. Two fields come from columns
 * on `jobs` (`role_type` + `assessment_link`); the rest come from
 * the workspace's `job` custom field values, looked up by the seeded
 * keys. Anything not yet set falls back to safe defaults so a fresh
 * vacante that hasn't been configured still produces a runnable
 * setupAnswers payload.
 */
export type JobRoleConfig = {
  roleType: JobRow["role_type"];
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

function asLanguage(v: unknown): "es" | "en" | null {
  return v === "es" || v === "en" ? v : null;
}

function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * Build a JobRoleConfig from the job row + the workspace's job
 * custom field values. Server-only — uses the auth-aware Supabase
 * client; RLS scopes definitions/values to the workspace.
 */
export async function loadJobRoleConfig(job: JobRow): Promise<JobRoleConfig> {
  const { definitions, valuesByDefId } = await loadCustomFieldsForEntity(
    "job",
    job.id,
  );

  // Index by key so we can pull each seeded role-config field by name.
  const byKey: Record<string, unknown> = {};
  for (const d of definitions) {
    const v = valuesByDefId[d.id];
    if (v !== undefined) byKey[d.key] = v;
  }

  return {
    roleType: job.role_type,
    jdLanguage:
      asLanguage(byKey.jd_language) ?? DEFAULTS.jdLanguage,
    outreachLanguage:
      asLanguage(byKey.outreach_language) ?? DEFAULTS.outreachLanguage,
    aiProcessLanguage:
      asLanguage(byKey.ai_process_language) ?? DEFAULTS.aiProcessLanguage,
    includeSalaryInPost:
      asBool(byKey.include_salary_in_post) ?? DEFAULTS.includeSalaryInPost,
    includeCompanyInPost:
      asBool(byKey.include_company_in_post) ?? DEFAULTS.includeCompanyInPost,
    useEmojisInJd:
      asBool(byKey.use_emojis_in_jd) ?? DEFAULTS.useEmojisInJd,
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
 */
export async function loadRequiredJobCustomFieldsMissing(
  jobId: string,
): Promise<CustomFieldDefinitionRow[]> {
  const { definitions, valuesByDefId } = await loadCustomFieldsForEntity(
    "job",
    jobId,
  );
  return definitions.filter((d) => {
    if (!d.is_required) return false;
    const v = valuesByDefId[d.id];
    if (v === undefined || v === null) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}
