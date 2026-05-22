// =====================================================
// JSONB column shapes for hiring.* tables.
// These are the in-app TypeScript types for values persisted as
// jsonb in Postgres. No runtime validation is performed at the
// boundary today; future step adds zod schemas for safety.
// =====================================================

// ----- Kickoff content (hiring.jobs.* jsonb columns) ----------------

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

// ----- Scoring rubric / interview structures -----------------------

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
