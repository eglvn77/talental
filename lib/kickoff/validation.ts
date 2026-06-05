/**
 * Runtime validators for the populate_kickoff tool output.
 *
 * Claude's tool-use already constrains the shape, but: the API can be
 * malformed under load, the prompt can drift, and we own persistence
 * across 4 tables. Failing loudly with a precise error beats writing
 * half-baked data and discovering it at render time.
 */
import { z } from "zod";

const OutreachChannelSchema = z.enum([
  "email",
  "linkedin_invitation",
  "linkedin_inmail",
  "linkedin_message",
]);

const JobOverviewSchema = z
  .object({
    compensation_detail: z.string().optional(),
    contract_type: z.string().optional(),
    working_hours: z.string().optional(),
    work_mode: z.string().optional(),
    office_location: z.string().optional(),
    target_start_date: z.string().nullable().optional(),
    language_requirements: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

const JobRequirementsSchema = z
  .object({
    must: z.array(z.string()),
    nice: z.array(z.string()),
  })
  .strict();

const JobSourcingSchema = z
  .object({
    criteria: z.array(z.string()),
    questions: z.array(z.string()),
    target_companies: z.array(z.string()),
  })
  .strict();

const JobHiringProcessStepSchema = z
  .object({
    order: z.number().int(),
    who: z.string(),
    focus: z.string(),
    format: z.string().nullable().optional(),
  })
  .strict();

const ApplicationQuestionSchema = z
  .object({
    question: z.string(),
    requirement: z.string(),
    type: z.enum(["eliminatory", "preferential"]),
    auto_reject_rule: z.string().nullable().optional(),
  })
  .strict();

const AIInterviewCriterionSchema = z
  .object({
    name: z.string(),
    question: z.string(),
    strong: z.string(),
    weak: z.string(),
    rationale: z.string().optional(),
  })
  .strict();

const AIInterviewCategorySchema = z
  .object({
    category: z.string(),
    description: z.string().optional(),
    criteria: z.array(AIInterviewCriterionSchema),
  })
  .strict();

const OutreachStepSchema = z
  .object({
    step: z.number().int().positive(),
    channel: OutreachChannelSchema,
    delay_hours: z.number().min(0),
    subject: z.string().optional(),
    body: z.string(),
  })
  .strict();

const KickoffChecklistItemSchema = z
  .object({
    phase: z.string(),
    item: z.string(),
    indent: z.number().int().min(0),
  })
  .strict();

export const KickoffOutputSchema = z
  .object({
    // Lenient default so a prompt that predates the job_title field
    // still validates; persist only backfills the title when the
    // vacante's own title is blank, so an empty value here is harmless.
    job_title: z.string().optional().default(""),
    structured_facts: z
      .object({
        work_modality: z.enum(["remote", "hybrid", "onsite"]).nullable(),
        contract_type: z
          .enum(["permanent", "temporary", "contractor", "internship"])
          .nullable(),
        working_hours: z.enum(["full_time", "part_time", "flexible"]).nullable(),
        salary_min: z.number().nullable(),
        salary_max: z.number().nullable(),
        salary_currency: z.string().nullable(),
        salary_period: z
          .enum(["monthly", "annual", "weekly", "hourly"])
          .nullable(),
      })
      .partial()
      .optional()
      .default({}),
    jd_public_description: z.string().min(1),
    overview: JobOverviewSchema,
    requirements: JobRequirementsSchema,
    // Optional sections are .nullish() — the model is allowed to omit
    // them entirely (e.g. during calibration when the recruiter only
    // wants to tweak outreach), in which case the key arrives as
    // undefined rather than explicit null. Both shapes are valid.
    sourcing: JobSourcingSchema.nullish(),
    hiring_process: z.array(JobHiringProcessStepSchema),
    application_questions: z.array(ApplicationQuestionSchema).nullish(),
    ai_interview_questions: z.array(AIInterviewCategorySchema).nullish(),
    talental_interview_script: z.string(),
    outreach_sequence: z.array(OutreachStepSchema).nullish(),
    linkedin_post: z.string().nullish(),
    kickoff_checklist: z.array(KickoffChecklistItemSchema),
    assessment_content: z.string().nullish(),
    source_conflicts: z.array(z.string()),
  })
  .strict();

/**
 * Parse and validate the populate_kickoff tool output. Throws a
 * formatted Error containing the path + reason on failure so the
 * server action surfaces a debuggable message in the kickoff_runs
 * audit log (and the UI toast).
 */
export function parseKickoffOutput(raw: unknown) {
  const result = KickoffOutputSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.join(".") || "(root)";
    throw new Error(
      `Kickoff payload validation failed at ${path}: ${first?.message ?? "unknown error"}`,
    );
  }
  // The schema accepts both null and undefined for the optional
  // sections (model can omit them entirely during calibration).
  // KickoffOutput downstream expects `T | null`, so normalise undefined
  // → null on every nullish-typed field.
  const d = result.data;
  return {
    ...d,
    sourcing: d.sourcing ?? null,
    application_questions: d.application_questions ?? null,
    ai_interview_questions: d.ai_interview_questions ?? null,
    outreach_sequence: d.outreach_sequence ?? null,
    linkedin_post: d.linkedin_post ?? null,
    assessment_content: d.assessment_content ?? null,
  };
}
