/**
 * TypeScript types mirroring the populate_kickoff tool output schema.
 * The Claude model is constrained to this shape via tool-use, so the
 * server can persist transactionally without runtime parsing.
 */

import type {
  AIInterviewCategory,
  ApplicationQuestion,
  JobHiringProcessStep,
  JobOverview,
  JobRequirements,
  JobSourcing,
  KickoffChecklistItem,
  OutreachStep,
} from "@/lib/hiring";

/** Whether the user provided the Salary and/or Company in the role snapshot. */
export type RoleSnapshotIncludes = {
  salary: boolean;
  company_name: boolean;
};

/** Captured from the Kickoff/Calibración dialog. Stored on every run. */
export type KickoffSetupAnswers = {
  jd_language: "es" | "en";
  outreach_language: "es" | "en";
  role_snapshot_includes: RoleSnapshotIncludes;
  use_emojis: boolean;
  ai_process_language: "es" | "en" | null;
  create_assessment: boolean;
};

/** Materials pasted by the recruiter. All optional except intake on first run. */
export type KickoffMaterials = {
  intake_transcript: string;
  client_jd?: string;
  additional_context?: string;
  /** Used on calibration runs (debriefs, feedback, etc.). */
  calibration_context?: string;
  /** Optional external URL to an assessment (Typeform, Google Form, etc.). */
  assessment_link?: string;
};

/**
 * The shape Claude returns via the populate_kickoff tool. Mirrors what
 * the master prompt knows to fill. Sections that don't apply to the
 * role_type are returned as null (sourcing, outreach for Inbound;
 * application/AI interview for Full Headhunting; assessment if Q7=No).
 */
export type KickoffOutput = {
  /**
   * The role's job title. Echoed from the intake when present, inferred
   * from the role described otherwise. Used to backfill `jobs.title`
   * when the vacante was created intake-first (empty title).
   */
  job_title: string;
  /**
   * Structured facts extracted from the intake so the ATS can backfill
   * the vacante's own columns (work_modality, salary). null values mean
   * "not stated" — persist only writes a field when the job's column is
   * still blank, so a recruiter-set value is never overwritten.
   */
  structured_facts?: {
    work_modality?: "remote" | "hybrid" | "onsite" | null;
    salary_min?: number | null;
    salary_max?: number | null;
    salary_currency?: string | null;
    salary_period?: "monthly" | "annual" | "weekly" | "hourly" | null;
  };
  /** HTML for the Tiptap public_description editor (600-900 words). */
  jd_public_description: string;
  overview: JobOverview;
  requirements: JobRequirements;
  sourcing: JobSourcing | null;
  hiring_process: JobHiringProcessStep[];
  application_questions: ApplicationQuestion[] | null;
  ai_interview_questions: AIInterviewCategory[] | null;
  /** Markdown — the Talental Interview script. */
  talental_interview_script: string;
  outreach_sequence: OutreachStep[] | null;
  /** Deprecated — always null. Kept in shape for backwards compat. */
  linkedin_post: string | null;
  kickoff_checklist: KickoffChecklistItem[];
  /** Optional markdown — only when Q7=true. */
  assessment_content: string | null;
  /** Any contradictions resolved between the intake call and the JD. */
  source_conflicts: string[];
};

export type KickoffRunKind = "kickoff" | "calibration";
