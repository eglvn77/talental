/**
 * Hardcoded whitelist of candidate fields ever exposed to the portal,
 * regardless of per-job toggles. Per-job toggles (show_email,
 * show_phone, show_linkedin_url, show_salary_expectations,
 * show_attachments) ALSO have to be true for a TOGGLEABLE field to
 * appear — see filterCandidateForPortal.
 *
 * Fields NOT in either list are silently dropped from any payload sent
 * to a portal client.
 */

/** Always visible if the candidate row has them — no toggle. */
export const PORTAL_FIXED_FIELDS = [
  "id",
  "full_name",
  "first_name",
  "last_name",
  "profile_picture_url",
  "headline",
  "current_position",
  "current_company_name",
  "city",
  "country",
  "summary",
  "years_of_experience",
  "candidate_report",
  "created_at",
] as const;

/** Gated by job_client_portal_settings toggles. */
export const PORTAL_TOGGLEABLE_FIELDS = {
  email: "show_email",
  phone: "show_phone",
  linkedin_url: "show_linkedin_url",
  salary_expectation_amount: "show_salary_expectations",
  salary_expectation_currency: "show_salary_expectations",
  salary_expectation_period: "show_salary_expectations",
  resume_url: "show_attachments",
} as const;

/**
 * Default toggle values used when no job_client_portal_settings row
 * exists for a job. Must mirror the defaults in
 * updateJobPortalSettingsAction's insert payload so the user gets the
 * same "sensible defaults" experience whether or not they've opened
 * the toggles UI for a particular vacante.
 */
export const PORTAL_SETTINGS_DEFAULTS = {
  show_email: false,
  show_phone: false,
  show_linkedin_url: true,
  show_salary_expectations: true,
  show_attachments: true,
  allow_view_notes: false,
  allow_feedback: true,
} as const;

/** Resolve a toggle through (settings row → default) without ever returning undefined. */
export function effectiveToggle(
  settings: Record<string, unknown> | null | undefined,
  key: keyof typeof PORTAL_SETTINGS_DEFAULTS,
): boolean {
  const v = settings?.[key];
  return typeof v === "boolean" ? v : PORTAL_SETTINGS_DEFAULTS[key];
}

export type PortalCandidateField =
  | (typeof PORTAL_FIXED_FIELDS)[number]
  | keyof typeof PORTAL_TOGGLEABLE_FIELDS;

/**
 * Returns a stripped copy of `candidate` containing only fields the
 * portal should ever see for this job.
 */
export function filterCandidateForPortal<T extends Record<string, unknown>>(
  candidate: T,
  settings: Partial<Record<
    (typeof PORTAL_TOGGLEABLE_FIELDS)[keyof typeof PORTAL_TOGGLEABLE_FIELDS],
    boolean
  >>,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of PORTAL_FIXED_FIELDS) {
    if (k in candidate) out[k] = candidate[k];
  }
  for (const [field, toggleKey] of Object.entries(PORTAL_TOGGLEABLE_FIELDS)) {
    if (settings[toggleKey] && field in candidate) {
      out[field] = candidate[field];
    }
  }
  return out as Partial<T>;
}
