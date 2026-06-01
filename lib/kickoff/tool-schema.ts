/**
 * Tool-use schema that Claude must call to return the kickoff package.
 * Anthropic enforces JSON-schema-validated output via `tools` + a strong
 * tool_choice on the API call.
 */

export const POPULATE_KICKOFF_TOOL = {
  name: "populate_kickoff",
  description:
    "Submit the complete recruiting package for the role. Call this exactly once with all sections populated according to the master prompt's content rules.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "job_title",
      "jd_public_description",
      "overview",
      "requirements",
      "sourcing",
      "hiring_process",
      "application_questions",
      "ai_interview_questions",
      "talental_interview_script",
      "outreach_sequence",
      "kickoff_checklist",
      "assessment_content",
      "source_conflicts",
    ],
    properties: {
      job_title: {
        type: "string",
        description:
          "The role's job title, e.g. 'Senior Backend Engineer' or 'Director de Marketing'. If the intake/materials already state a title, echo it verbatim. If not, INFER a concise, conventional title from the role described in the intake. Never leave this empty. Match the language of the role's market.",
      },
      jd_public_description: {
        type: "string",
        description:
          "HTML for the public job description rendered in Tiptap. 600-900 words. Follow the JD spec from the master prompt: role snapshot (only the items selected in role_snapshot_includes), opening hook, then the rest of the AIDA sections in order. Use <h2>, <h3>, <p>, <ul>, <li>. No <h1>. No <a> unless explicitly needed.",
      },
      overview: {
        type: "object",
        additionalProperties: false,
        required: [
          "compensation_detail",
          "contract_type",
          "working_hours",
          "work_mode",
          "office_location",
          "target_start_date",
          "language_requirements",
          "notes",
        ],
        properties: {
          compensation_detail: { type: "string" },
          contract_type: { type: "string" },
          working_hours: { type: "string" },
          work_mode: { type: "string" },
          office_location: { type: "string" },
          target_start_date: { type: ["string", "null"] },
          language_requirements: { type: "string" },
          notes: { type: "string" },
        },
        description:
          "Internal Overview toggle. Use TBD where not discussed. All values are plain text.",
      },
      requirements: {
        type: "object",
        additionalProperties: false,
        required: ["must", "nice"],
        properties: {
          must: { type: "array", items: { type: "string" } },
          nice: { type: "array", items: { type: "string" } },
        },
      },
      sourcing: {
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
      },
      hiring_process: {
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
      },
      application_questions: {
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
      },
      ai_interview_questions: {
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
                    description: "Max 255 characters.",
                  },
                  weak: {
                    type: "string",
                    description: "Max 255 characters.",
                  },
                  rationale: { type: "string" },
                },
              },
            },
          },
        },
      },
      talental_interview_script: {
        type: "string",
        description:
          "Markdown — Talental Interview script for this role_type per the master prompt's spec. Includes the variant(s) that apply.",
      },
      outreach_sequence: {
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
      },
      linkedin_post: {
        type: ["string", "null"],
        description:
          "DEPRECATED. Return null. The product no longer surfaces a LinkedIn post.",
      },
      kickoff_checklist: {
        type: "array",
        description:
          "Role-lifecycle checklist items per the master prompt's Kickoff Checklist spec.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["phase", "item", "indent"],
          properties: {
            phase: { type: "string" },
            item: { type: "string" },
            indent: { type: "integer" },
          },
        },
      },
      assessment_content: {
        type: ["string", "null"],
        description:
          "Markdown — Role Assessment content. Only when create_assessment=true. Null otherwise.",
      },
      source_conflicts: {
        type: "array",
        items: { type: "string" },
        description:
          "One line per contradiction resolved between the intake call and the JD. Empty array if none.",
      },
    },
  },
} as const;
