import { type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";
import { readCustomClaims } from "./auth/jwt-claims";

// ============================================================
// Enums (mirror of hiring.* enum types in Postgres)
// ============================================================

export type PipelineCategory =
  | "sourced"
  | "contacted"
  | "answered"
  | "applied"
  | "screening"
  | "submitted"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

export type JobStatus =
  | "borrador"
  | "activa"
  | "por_cerrar"
  | "cubierta"
  | "cancelada";

export type SalaryType = "gross" | "net" | "unspecified";

export type SalaryFrequency = "monthly" | "annual" | "weekly" | "hourly";

export type RoleType =
  | "full_headhunting"
  | "hybrid_ai_hunting"
  | "inbound_ai_driven";

export type EngagementKind = "retained" | "contingent" | "rpo";

// =====================================================
// Kickoff content shapes (JSONB columns on hiring.jobs)
// =====================================================

export type JobOverview = {
  compensation_detail?: string;
  contract_type?: string;
  working_hours?: string;
  work_mode?: string;
  office_location?: string;
  target_start_date?: string | null;
  language_requirements?: string;
  notes?: string;
};

export type JobRequirements = {
  must: string[];
  nice: string[];
};

export type JobSourcing = {
  criteria: string[];
  questions: string[];
  target_companies: string[];
};

export type JobHiringProcessStep = {
  order: number;
  who: string;
  focus: string;
  format?: string | null;
};

export type ApplicationQuestion = {
  question: string;
  requirement: string;
  type: "eliminatory" | "preferential";
  auto_reject_rule?: string | null;
};

export type AIInterviewCriterion = {
  name: string;
  question: string;
  strong: string;
  weak: string;
  rationale?: string;
};

export type AIInterviewCategory = {
  category: string;
  description?: string;
  criteria: AIInterviewCriterion[];
};

export type OutreachStep = {
  step: number;
  channel:
    | "email"
    | "linkedin_invitation"
    | "linkedin_inmail"
    | "linkedin_message";
  delay_hours: number;
  subject?: string;
  body: string;
};

export type KickoffChecklistItem = {
  phase: string;
  item: string;
  indent: number;
};

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

export type CompanyStatus = "none" | "prospect" | "client" | "partner";

export type PlanTier =
  | "trial"
  | "active"
  | "past_due"
  | "canceled"
  | "free";

export type WorkspaceRow = {
  id: string;
  slug: string;
  name: string;
  plan_tier: PlanTier;
  trial_ends_at: string | null;
  billing_email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

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

export type MessageChannel = "email" | "linkedin" | "whatsapp" | "sms" | "other";
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

export type CustomFieldDefinitionRow = {
  id: string;
  workspace_id: string;
  entity_type: EntityType;
  key: string;
  label: string;
  kind: CustomFieldKind;
  options: string[] | null;
  is_required: boolean;
  position: number;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type CustomFieldValueRow = {
  id: string;
  workspace_id: string;
  definition_id: string;
  entity_type: EntityType;
  entity_id: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

// ============================================================
// JSON-shaped fields
// ============================================================

export type RubricCriterion = {
  key: string;
  label: string;
  weight: number;
  description?: string;
};

export type Rubric = {
  criteria: RubricCriterion[];
  pass_threshold?: number;
};

export type ScreeningQuestion = {
  id: string;
  prompt: string;
  kind: "yes_no" | "short_text" | "multi_choice" | "number";
  required?: boolean;
  options?: string[];
  disqualify_if?: string | string[];
};

export type InterviewQuestion = {
  id: string;
  prompt: string;
  probe_hints?: string[];
  rubric_keys?: string[];
};

export type TranscriptSegment = {
  speaker: "agent" | "candidate";
  text: string;
  ts_ms: number;
};

export type RubricBreakdown = Record<
  string,
  { score: number; rationale: string; evidence?: string[] }
>;

// ============================================================
// Row types
// ============================================================

export type JobRow = {
  id: string;
  workspace_id: string;
  company_id: string | null;
  title: string;
  public_description: string | null;
  company_blurb: string | null;
  full_description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_type: SalaryType;
  salary_frequency: SalaryFrequency;
  location: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_place_id: string | null;
  work_modality: "remote" | "hybrid" | "onsite" | null;
  remote_policy: string | null;
  rubric: Rubric | null;
  screening_questions: ScreeningQuestion[] | null;
  interview_questions: InterviewQuestion[] | null;
  apply_email_alias: string | null;
  status: JobStatus;
  intake_form_response: unknown;
  ai_scoring_enabled: boolean;
  ai_scoring_criteria: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  published_at: string | null;
  closed_at: string | null;
  // ---- Kickoff fields ----
  role_type: RoleType | null;
  open_date: string | null;
  target_start_date: string | null;
  hiring_manager_name: string | null;
  contract_type: string | null;
  working_hours: string | null;
  language_requirements: string | null;
  overview: JobOverview | null;
  requirements: JobRequirements | null;
  sourcing: JobSourcing | null;
  hiring_process: JobHiringProcessStep[] | null;
  interview_script: unknown;
  linkedin_post: string | null;
  assessment_content: string | null;
  assessment_link: string | null;
  compensation_detail: string | null;
  internal_notes: string | null;
  // ---- Finance fields ----
  engagement_kind: EngagementKind | null;
  fee_pct: number | null;
  fee_currency: string | null;
  deposit_pct: number | null;
  monthly_retainer: number | null;
  placement_revenue_estimated: number | null;
};

export type PromptRow = {
  id: string;
  workspace_id: string;
  key: string;
  label: string;
  body: string;
  model: string;
  model_params: Record<string, unknown> | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

export type KickoffRunRow = {
  id: string;
  workspace_id: string;
  job_id: string;
  run_kind: "kickoff" | "calibration";
  setup_answers: Record<string, unknown>;
  materials: Record<string, unknown>;
  output: Record<string, unknown> | null;
  model: string;
  status: "pending" | "success" | "failed";
  error_message: string | null;
  duration_ms: number | null;
  ran_by: string | null;
  ran_at: string;
};

export type PipelineStageRow = {
  id: string;
  workspace_id: string;
  job_id: string;
  name: string;
  category: PipelineCategory;
  color: string | null;
  position: number;
  is_terminal: boolean;
  client_portal_visible: boolean;
  on_enter_action: unknown;
  created_at: string;
  updated_at: string;
};

export type CandidateRow = {
  id: string;
  workspace_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  resume_text: string | null;
  parsed_profile: unknown;
  default_source: CandidateSource | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationRow = {
  id: string;
  workspace_id: string;
  candidate_id: string;
  job_id: string;
  source: CandidateSource;
  source_meta: unknown;
  stage_id: string | null;
  category: PipelineCategory | null;
  screening_score: number | null;
  interview_score: number | null;
  recruiter_decision: string | null;
  recruiter_notes: string | null;
  rejection_reason: string | null;
  rejection_reason_id: string | null;
  assigned_to: string | null;
  applied_at: string;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
};

export type ScreeningRow = {
  id: string;
  workspace_id: string;
  application_id: string;
  kind: ScreeningKind;
  link_token: string | null;
  link_sent_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  transcript: TranscriptSegment[] | null;
  raw_response: unknown;
  score: number | null;
  passed: boolean | null;
  scoring_rationale: string | null;
  created_at: string;
};

export type InterviewRow = {
  id: string;
  workspace_id: string;
  application_id: string;
  link_token: string | null;
  link_sent_at: string | null;
  elevenlabs_agent_id: string | null;
  elevenlabs_conversation_id: string | null;
  cf_stream_video_id: string | null;
  cf_stream_playback_url: string | null;
  recording_started_at: string | null;
  transcript: TranscriptSegment[] | null;
  score: number | null;
  rubric_breakdown: RubricBreakdown | null;
  ai_summary: string | null;
  status: InterviewStatus;
  failure_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type SubmissionRow = {
  id: string;
  workspace_id: string;
  application_id: string;
  anonymized_pdf_url: string | null;
  view_token: string | null;
  sent_at: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  client_decision: string | null;
  client_decided_at: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  workspace_id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  job_id: string | null;
  application_id: string | null;
  raw_event: unknown;
  created_at: string;
  paid_at: string | null;
};

export type UnlockRow = {
  id: string;
  workspace_id: string;
  application_id: string;
  submission_id: string | null;
  payment_id: string;
  unlocked_at: string;
  candidate_notified_at: string | null;
  client_revealed_at: string | null;
  created_at: string;
};

export type ApplicationEventRow = {
  id: number;
  workspace_id: string;
  application_id: string;
  event_type: string;
  payload: unknown;
  actor: string | null;
  created_at: string;
};

export type TeamMemberRow = {
  id: string;
  workspace_id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  team_role: TeamRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyRow = {
  id: string;
  workspace_id: string;
  name: string;
  domain: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  size_range: string | null;
  hq_location: string | null;
  description: string | null;
  logo_url: string | null;
  status: CompanyStatus;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactRow = {
  id: string;
  workspace_id: string;
  company_id: string | null;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  location: string | null;
  notes_summary: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DealRow = {
  id: string;
  workspace_id: string;
  title: string;
  company_id: string | null;
  primary_contact_id: string | null;
  stage: DealStage;
  value_amount: number | null;
  value_currency: string | null;
  expected_close_date: string | null;
  description: string | null;
  owner_id: string | null;
  created_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TagRow = {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type NoteRow = {
  id: string;
  workspace_id: string;
  entity_type: EntityType;
  entity_id: string;
  body: string;
  is_pinned: boolean;
  author_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  entity_type: EntityType | null;
  entity_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RejectionReasonRow = {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  position: number;
  is_system: boolean;
  created_at: string;
};

export type JobClientPortalSettingsRow = {
  job_id: string;
  is_enabled: boolean;
  show_email: boolean;
  show_phone: boolean;
  show_salary_expectations: boolean;
  show_attachments: boolean;
  allow_feedback: boolean;
  allow_candidate_movement: boolean;
  allow_view_analytics: boolean;
  allow_view_notes: boolean;
  slug: string | null;
  enabled_at: string | null;
  updated_at: string;
};

// ============================================================
// Schema-scoped clients
// ============================================================
// `hiring()` is the default — auth-aware (cookie session) so RLS
// applies. Use this in pages and server actions.
//
// `hiringAdmin()` is service-role and bypasses RLS. Only use when
// you have an explicit reason (cross-workspace ops, scripts,
// pre-session lookups). Mark each call site with a comment.

export async function hiring(): Promise<ReturnType<SupabaseClient["schema"]>> {
  const supabase = await createSupabaseServerClient();
  return supabase.schema("hiring");
}

export function hiringAdmin(): ReturnType<SupabaseClient["schema"]> {
  return getSupabaseAdmin().schema("hiring");
}

// ============================================================
// Workspace context — session-derived
// ============================================================

export async function getRequestWorkspaceId(): Promise<string> {
  const supabase = await createSupabaseServerClient();

  // Fast path: read workspace_id from the JWT custom claim populated by
  // public.custom_access_token_hook — no DB round-trip.
  const { data: sessionData } = await supabase.auth.getSession();
  const claims = readCustomClaims(sessionData.session?.access_token);
  if (claims.workspace_id) return claims.workspace_id;

  // Slow fallback: hook not enabled yet, or session was issued before the
  // hook was wired up. Validate against Supabase and look up team_members.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }
  const { data: member, error: memberErr } = await supabase
    .schema("hiring")
    .from("team_members")
    .select("workspace_id")
    .eq("auth_user_id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (memberErr || !member) {
    throw new Error("User has no workspace");
  }
  return member.workspace_id as string;
}

// ============================================================
// Default pipeline (seeded on role creation)
// ============================================================

export type DefaultStageDef = {
  name: string;
  category: PipelineCategory;
  color: string;
  is_terminal?: boolean;
  client_portal_visible?: boolean;
};

// Default 10-stage pipeline seeded into every new job.
// Names in Spanish (UI labels); categories map to the hiring.pipeline_category enum.
export const DEFAULT_PIPELINE_STAGES: DefaultStageDef[] = [
  { name: "Aplicantes", category: "applied", color: "#f97316" },
  { name: "Pre-Aprobados", category: "screening", color: "#fb923c" },
  { name: "Contactados", category: "contacted", color: "#f97316" },
  { name: "Agendados", category: "screening", color: "#3b82f6" },
  { name: "Enviados a Cliente", category: "submitted", color: "#3b82f6", client_portal_visible: true },
  { name: "Entrevistas Cliente", category: "interview", color: "#14b8a6", client_portal_visible: true },
  { name: "Oferta", category: "offer", color: "#22c55e", client_portal_visible: true },
  { name: "Referencias", category: "offer", color: "#16a34a" },
  { name: "Contratado", category: "hired", color: "#16a34a", is_terminal: true, client_portal_visible: true },
  { name: "Rechazados", category: "rejected", color: "#ef4444", is_terminal: true },
];

// Color hint for a category (used for empty cells, default new stages, etc.).
export const CATEGORY_COLOR: Record<PipelineCategory, string> = {
  sourced: "#f97316",
  contacted: "#f97316",
  answered: "#f97316",
  applied: "#f97316",
  screening: "#fb923c",
  submitted: "#3b82f6",
  interview: "#14b8a6",
  offer: "#22c55e",
  hired: "#16a34a",
  rejected: "#ef4444",
  withdrawn: "#f87171",
};
