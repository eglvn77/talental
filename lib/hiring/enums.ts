// =====================================================
// Enums — TypeScript mirrors of hiring.* Postgres enums.
// =====================================================

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
