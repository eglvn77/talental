/**
 * Per-section JSON Schema slices extracted from the legacy monolith
 * in `tool-schema.ts`. Each constant matches the `input_schema.properties[<key>]`
 * fragment as it shipped before the Phase 4a-i refactor.
 *
 * Seed source for the workspace's `resource_definitions.schema_json`
 * column. The runtime `buildKickoffTool` reads from DB, not from
 * these — kept here for the migration backfill + the "restore
 * default" flow.
 */

export const DEFAULT_REQUIREMENTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["must", "nice"],
  properties: {
    must: { type: "array", items: { type: "string" } },
    nice: { type: "array", items: { type: "string" } },
  },
} as const;

export const DEFAULT_SOURCING_SCHEMA = {
  type: ["object", "null"],
  additionalProperties: false,
  description:
    "Sourcing Guidelines — only for Full Headhunting and Hybrid AI + Hunting. Set to null otherwise. Always in English.",
  properties: {
    criteria: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    target_companies: { type: "array", items: { type: "string" } },
  },
  required: ["criteria", "questions", "target_companies"],
} as const;

export const DEFAULT_HIRING_PROCESS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["order", "who", "focus"],
    properties: {
      order: { type: "integer" },
      who: { type: "string" },
      focus: { type: "string" },
      format: { type: ["string", "null"] },
    },
  },
} as const;

export const DEFAULT_APPLICATION_QUESTIONS_SCHEMA = {
  type: ["array", "null"],
  description:
    "Tally form questions. Only for Hybrid AI + Hunting and Inbound AI Driven. Null otherwise.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["question", "requirement", "type"],
    properties: {
      question: { type: "string" },
      requirement: { type: "string" },
      type: { type: "string", enum: ["eliminatory", "preferential"] },
      auto_reject_rule: { type: ["string", "null"] },
    },
  },
} as const;

export const DEFAULT_AI_INTERVIEW_QUESTIONS_SCHEMA = {
  type: ["array", "null"],
  description:
    "Categories with criteria. Only for Hybrid AI + Hunting and Inbound AI Driven. Null otherwise. Maximum 10 criteria total across all categories.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["category", "criteria"],
    properties: {
      category: { type: "string" },
      description: { type: "string" },
      criteria: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "question", "strong", "weak"],
          properties: {
            name: { type: "string" },
            question: { type: "string" },
            strong: {
              type: "string",
              description:
                "Rubric for a strong answer (criteria/signals). Max 255 characters.",
            },
            weak: {
              type: "string",
              description:
                "Rubric for a weak answer (criteria/signals). Max 255 characters.",
            },
            rationale: { type: "string" },
            strong_example_answer: {
              type: "string",
              description:
                "Optional. 1–2 sentences showing what a strong answer sounds like in the candidate's voice. Anchors the rubric in concrete language.",
            },
            weak_example_answer: {
              type: "string",
              description: "Optional. 1–2 sentences showing a weak/thin answer.",
            },
            probing_questions: {
              type: "array",
              description:
                "Optional. 1–3 follow-up questions to ask when the candidate's first answer is too vague to score against the rubric.",
              items: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

export const DEFAULT_TALENTAL_INTERVIEW_SCRIPT_SCHEMA = {
  type: "string",
  description:
    "Markdown — Talental Interview script for this role_type per the master prompt's spec. Includes the variant(s) that apply.",
} as const;

export const DEFAULT_OUTREACH_SEQUENCE_SCHEMA = {
  type: ["array", "null"],
  description:
    "5-message outreach sequence — only for Full Headhunting and Hybrid AI + Hunting. Null otherwise.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["step", "channel", "delay_hours", "body"],
    properties: {
      step: { type: "integer" },
      channel: {
        type: "string",
        enum: [
          "email",
          "linkedin_invitation",
          "linkedin_inmail",
          "linkedin_message",
        ],
      },
      delay_hours: { type: "integer" },
      subject: { type: "string" },
      body: { type: "string" },
    },
  },
} as const;

/** Map system key → seed schema. Used by the migration. */
export const DEFAULT_SECTION_SCHEMAS: Record<string, unknown> = {
  requirements: DEFAULT_REQUIREMENTS_SCHEMA,
  sourcing: DEFAULT_SOURCING_SCHEMA,
  hiring_process: DEFAULT_HIRING_PROCESS_SCHEMA,
  application_questions: DEFAULT_APPLICATION_QUESTIONS_SCHEMA,
  ai_interview_questions: DEFAULT_AI_INTERVIEW_QUESTIONS_SCHEMA,
  talental_interview_script: DEFAULT_TALENTAL_INTERVIEW_SCRIPT_SCHEMA,
  outreach_sequence: DEFAULT_OUTREACH_SEQUENCE_SCHEMA,
};
