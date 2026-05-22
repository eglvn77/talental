// =====================================================
// Row types — TypeScript shapes for hiring.* table rows.
// Keep in sync with the database schema; future step will derive
// these from generated Supabase types.
// =====================================================

import type {
  CandidateSource,
  CompanyStatus,
  CustomFieldKind,
  DealStage,
  EngagementKind,
  EntityType,
  InterviewStatus,
  JobStatus,
  PaymentKind,
  PaymentStatus,
  PipelineCategory,
  PlanTier,
  RoleType,
  SalaryFrequency,
  SalaryType,
  TaskPriority,
  TaskStatus,
  TeamRole,
} from "./enums";
import type {
  JobHiringProcessStep,
  JobOverview,
  JobRequirements,
  JobSourcing,
  InterviewQuestion,
  Rubric,
  RubricBreakdown,
  ScreeningQuestion,
  TranscriptSegment,
} from "./jsonb-shapes";

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
  kind: import("./enums").ScreeningKind;
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
