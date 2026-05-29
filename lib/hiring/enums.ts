// =====================================================
// Enums — TypeScript mirrors of hiring.* Postgres enums.
// =====================================================

export type PipelineCategory =
  | "sourced"
  | "applicants"
  | "shortlisted"
  | "contacted"
  | "conversation"
  | "screen"
  | "submitted"
  | "client_interview"
  | "assessment"
  | "background_check"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

// Categories that always close the candidate's funnel. Any stage tagged
// with one of these counts as terminal — we don't expose a per-stage
// toggle for it any more (always-on by category).
export const TERMINAL_PIPELINE_CATEGORIES = [
  "hired",
  "rejected",
  "withdrawn",
] as const satisfies ReadonlyArray<PipelineCategory>;

export function isTerminalCategory(c: PipelineCategory): boolean {
  return (TERMINAL_PIPELINE_CATEGORIES as readonly string[]).includes(c);
}

/**
 * Job statuses used to be a Postgres enum with five baked-in values
 * (borrador / activa / por_cerrar / cubierta / cancelada). They're
 * now workspace-scoped rows in `hiring.job_statuses`, so the source
 * of truth for both label and behavior moved from this file to the
 * DB. Code that needs to reason about a status reads its row (see
 * `JobStatusRow` in rows.ts) and checks `is_open` / `is_archived`
 * flags instead of hardcoding string comparisons.
 *
 * For the cases that DO still want a stable key (defaults seeded
 * by the platform), the string union below documents the slugs
 * the seed function emits.
 */
export type SystemJobStatusKey = "borrador" | "activa" | "archivada";

export type SalaryType = "gross" | "net" | "unspecified";

export type SalaryFrequency = "monthly" | "annual" | "weekly" | "hourly";

export type RoleType =
  | "full_headhunting"
  | "hybrid_ai_hunting"
  | "inbound_ai_driven";

export type EngagementKind = "retained" | "contingent" | "rpo";

export type PaymentKind = "role_publish" | "candidate_unlock";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export type CandidateSource =
  | "linkedin"
  | "indeed"
  | "referral"
  | "direct"
  | "other"
  | "bulk_import";

export type ScreeningKind = "form" | "text_chat" | "voice";

export type InterviewStatus =
  | "pending"
  | "link_sent"
  | "in_progress"
  | "completed"
  | "failed"
  | "expired";

export type TeamRole = "owner" | "admin" | "recruiter";

export type EntityType =
  | "candidate"
  | "job"
  | "application"
  | "company"
  | "contact"
  | "deal";

/**
 * A company-status KEY. Statuses are now workspace-scoped, editable
 * rows in hiring.company_statuses (not a fixed enum), so this is just a
 * string slug. The four seeded keys ('client' | 'prospect' | 'partner'
 * | 'none') still exist by default but can be renamed/deleted/extended.
 */
export type CompanyStatus = string;

export type PlanTier =
  | "trial"
  | "active"
  | "past_due"
  | "canceled"
  | "free";

export type DealStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export type TaskStatus = "open" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high";

export type SequenceStatus = "draft" | "active" | "paused" | "archived";
export type SequenceStepKind =
  | "email"
  | "manual_task"
  | "wait"
  | "linkedin_message"
  | "whatsapp";
export type EnrollmentStatus =
  | "active"
  | "paused"
  | "completed"
  | "replied"
  | "unsubscribed"
  | "bounced"
  | "failed";

export type MessageChannel =
  | "email"
  | "linkedin"
  | "whatsapp"
  | "sms"
  | "other";
export type MessageDirection = "inbound" | "outbound";

export type CustomFieldKind =
  | "text"
  | "long_text"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "multi_select"
  | "url"
  | "email";
