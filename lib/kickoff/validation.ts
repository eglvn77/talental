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
    jd_public_description: z.string().min(1),
    overview: JobOverviewSchema,
    requirements: JobRequirementsSchema,
    sourcing: JobSourcingSchema.nullable(),
    hiring_process: z.array(JobHiringProcessStepSchema),
    application_questions: z.array(ApplicationQuestionSchema).nullable(),
    ai_interview_questions: z.array(AIInterviewCategorySchema).nullable(),
    talental_interview_script: z.string(),
    outreach_sequence: z.array(OutreachStepSchema).nullable(),
    linkedin_post: z.string().nullable(),
    kickoff_checklist: z.array(KickoffChecklistItemSchema),
    assessment_content: z.string().nullable(),
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
  return result.data;
}
