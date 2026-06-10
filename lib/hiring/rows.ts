// =====================================================
// Row types — TypeScript shapes for hiring.* table rows.
//
// Derived from supabase/types.ts (regenerate via `npm run db:types`).
// JSONB columns come back as `Json` from codegen; we overlay them with
// the richer hand-typed shapes from ./jsonb-shapes so call sites get
// real intellisense.
// =====================================================

import type { Database } from "@/supabase/types";
import type { SalaryFrequency, SalaryType } from "./enums";
import type {
  InterviewQuestion,
  JobHiringProcessStep,
  JobOverview,
  JobRequirements,
  JobSourcing,
  Rubric,
  RubricBreakdown,
  ScreeningQuestion,
  TranscriptSegment,
} from "./jsonb-shapes";

type Row<T extends keyof Database["hiring"]["Tables"]> =
  Database["hiring"]["Tables"][T]["Row"];

/**
 * Overlay JSONB columns on a generated Row with typed shapes. Anything
 * not listed in `Overlay` keeps its generated type (string/number/Json).
 */
type WithJsonb<R, Overlay> = Omit<R, keyof Overlay> & Overlay;

// ---- Tenancy --------------------------------------------------------
export type WorkspaceRow = Row<"workspaces">;
export type TeamMemberRow = Row<"team_members">;

// ---- Custom fields --------------------------------------------------
// `options` is `Json | null` in codegen. The runtime shape was
// `string[]` originally and now also accepts `Array<{value, color?}>`
// so the editor can persist per-option colors. Consumers should pass
// the raw value through `normalizeOptions()` to get a uniform list.
export type CustomFieldOptionStored =
  | string
  | { value: string; color?: string | null };
export type CustomFieldDefinitionRow = WithJsonb<
  Row<"custom_field_definitions">,
  { options: CustomFieldOptionStored[] | null }
>;
export type CustomFieldValueRow = WithJsonb<
  Row<"custom_field_values">,
  { value: unknown }
>;

// ---- Jobs -----------------------------------------------------------
// Status: matches the DB enum exactly (Spanish-only after the
// drop_legacy_role_status_values migration), no overlay needed.
// Salary type/frequency: DB columns are `text` but CHECK constraints
// enforce the narrow values; overlay so consumers get the union type
// from the generated `string` column.
export type JobRow = WithJsonb<
  Row<"jobs">,
  {
    salary_type: SalaryType;
    salary_frequency: SalaryFrequency;
    overview: JobOverview | null;
    requirements: JobRequirements | null;
    sourcing: JobSourcing | null;
    hiring_process: JobHiringProcessStep[] | null;
    rubric: Rubric | null;
    screening_questions: ScreeningQuestion[] | null;
    interview_questions: InterviewQuestion[] | null;
  }
>;

export type PromptRow = Row<"prompts">;
export type KickoffRunRow = Row<"kickoff_runs">;
export type PipelineStageRow = Row<"pipeline_stages">;
export type JobClientPortalSettingsRow = Row<"job_client_portal_settings">;
export type PortalTokenRow = Row<"portal_tokens">;
export type PortalSessionRow = Row<"portal_sessions">;
export type PortalCommentRow = Row<"portal_comments">;
export type PortalAllowedEmailRow = Row<"portal_allowed_emails">;
export type RejectionReasonRow = Row<"rejection_reasons">;
export type JobClosureReasonRow = Row<"job_closure_reasons">;
export type JobStatusRow = Row<"job_statuses">;
export type CompanyStatusRow = Row<"company_statuses">;
/** Workspace-scoped Source/Origen option (scope: candidate | company). */
export type SourceRow = Row<"sources">;
/** Per-vacante careers tracking link (?src=<token> → source). */
export type JobTrackingLinkRow = Row<"job_tracking_links">;
export type ProcessTemplateRow = Row<"process_templates">;
/** Reusable communication snippet (name + subject + content). */
export type MessageTemplateRow = Row<"message_templates">;

// ---- Resources (Phase 1 of the Paquete-→-Resources rebuild). One
// `resource_definitions` row per workspace × section; one
// `resource_values` row per job × definition. See
// supabase/migrations/20260606010000_resources_a_tables_and_seed.sql.
export type ResourceDefinitionRow = Row<"resource_definitions">;
export type ResourceValueRow = Row<"resource_values">;
// `category` column is `hiring.pipeline_category` enum in DB; codegen
// types it as string, so we overlay it with the narrower union for
// nicer DX at call sites.
export type ProcessTemplateStageRow = WithJsonb<
  Row<"process_template_stages">,
  { category: import("./enums").PipelineCategory }
>;

// ---- Candidates / applications --------------------------------------
export type CandidateRow = Row<"candidates">;

/** Shape persisted in applications.ai_next_steps. Mirrored from
 *  lib/ai/application-context.ts NextStep. Kept here so callers can
 *  type a fetched row without dragging the AI lib into client code. */
export type ApplicationAiNextStep = {
  label: string;
  urgency: "low" | "normal" | "high";
  hint?: string;
};

export type ApplicationRow = WithJsonb<
  Row<"applications">,
  { ai_next_steps: ApplicationAiNextStep[] | null }
>;
export type ApplicationEventRow = Row<"application_events">;

export type ScreeningRow = WithJsonb<
  Row<"screenings">,
  { transcript: TranscriptSegment[] | null }
>;

export type InterviewRow = WithJsonb<
  Row<"interviews">,
  {
    transcript: TranscriptSegment[] | null;
    rubric_breakdown: RubricBreakdown | null;
  }
>;

export type SubmissionRow = Row<"submissions">;
export type PaymentRow = Row<"payments">;
export type UnlockRow = Row<"unlocks">;

// ---- Talental OS (agent org + strategic backlog) -------------------
/** Functional area inside the company (Hiring, Engineering, Sales…) —
 *  groups agents and initiatives. */
export type AgentAreaRow = Row<"agent_areas">;
/** A single agent: chief-of-staff, area-lead, or executor. */
export type AgentRow = Row<"agents">;
/** Backlog item — strategy/feature/bug/etc. assignable to an area
 *  and/or agent, ordered by `position` within `status`. */
export type InitiativeRow = Row<"initiatives">;
/** One execution attempt of an agent. Backend writes here when an
 *  agent runs; the cockpit reads them for the activity feed. */
export type AgentRunRow = Row<"agent_runs">;

/** Interview transcript (Granola sync or manual upload). Feeds the
 *  per-application candidate report generator. */
export type InterviewTranscriptRow = Row<"interview_transcripts">;

// ---- CRM ------------------------------------------------------------
export type CompanyRow = Row<"companies">;
export type ContactRow = Row<"contacts">;
export type DealRow = Row<"deals">;
export type TagRow = Row<"tags">;
export type NoteRow = Row<"notes">;
export type TaskRow = Row<"tasks">;

// ---- Job commercial-terms enums -------------------------------------
/**
 * Fee model for a job. Mirrors the CHECK on hiring.jobs.fee_model.
 *   retained   — anticipo (retainer up front, balance at placement)
 *   contingent — al éxito (full fee on placement, no retainer)
 */
export type FeeModel = "retained" | "contingent";

/**
 * Billing format the client receives. Mirrors the CHECK on
 * hiring.jobs.billing_format.
 *   invoice — USD invoice (US-billed clients)
 *   factura — MXN CFDI factura (MX-billed clients)
 */
export type BillingFormat = "invoice" | "factura";

// ---- Unipile integrations -------------------------------------------
export type ConnectedAccountRow = Row<"connected_accounts">;

/**
 * Provider keys recognised by Unipile's Hosted Auth Wizard. Constrained
 * by the CHECK on hiring.connected_accounts.provider — keep both in
 * sync with the migration.
 */
export type ConnectedAccountProvider =
  | "LINKEDIN"
  | "WHATSAPP"
  | "GOOGLE"
  | "OUTLOOK"
  | "IMAP"
  | "INSTAGRAM"
  | "TELEGRAM";

/**
 * Lifecycle status for a connected account. Mirrors the CHECK on
 * hiring.connected_accounts.status; webhook handlers map Unipile's
 * status payloads onto this set.
 */
export type ConnectedAccountStatus =
  | "PENDING"
  | "OK"
  | "CREDENTIALS"
  | "DISCONNECTED"
  | "ERROR";
