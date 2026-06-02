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
  /** 1–2 sentences showing what a strong answer sounds like in the
   *  candidate's voice. Optional — only present on kickoffs generated
   *  after the probing/examples upgrade. */
  strong_example_answer?: string;
  /** 1–2 sentences showing a weak/thin answer. Same optionality. */
  weak_example_answer?: string;
  /** 1–3 follow-up questions the interviewer (AI or human) can use
   *  when the candidate's first answer is too vague to score. */
  probing_questions?: string[];
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
  /**
   * Optional id of a candidate custom-field definition. When set, the
   * applicant's answer to this question is auto-written to that
   * candidate field on submit (auto-populate), so it persists at the
   * candidate level beyond this one application.
   */
  map_to_field?: string | null;
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
