import "server-only";

/**
 * Tool schema for the candidate-report generator. Claude calls this
 * tool exactly once with the full structured report. `additional
 * Properties: false` everywhere so the model can't invent fields.
 *
 * Mirrors the contract documented in the candidate_report_master
 * prompt template (seeded in migration
 * 20260607120000_candidate_reports_a_schema.sql).
 */

export const POPULATE_CANDIDATE_REPORT_TOOL = {
  name: "populate_candidate_report",
  description:
    "Emit the structured candidate report. Call exactly once with all required fields.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "overall_rating",
      "summary",
      "strengths",
      "concerns",
      "to_probe",
      "compensation",
      "recommendation",
      "input_provenance",
    ],
    properties: {
      overall_rating: {
        type: "string",
        enum: ["strong_yes", "yes", "lean_yes", "lean_no", "no"],
        description:
          "Bottom-line hire recommendation. Use lean_no or no when the available signal is weak (no transcript + no CV).",
      },
      summary: {
        type: "string",
        description:
          "1-2 paragraph markdown overview tied to the job's requirements. Lead with the bottom line.",
      },
      strengths: {
        type: "array",
        minItems: 0,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["point", "evidence"],
          properties: {
            point: { type: "string" },
            evidence: {
              type: "string",
              description:
                "Short quote or paraphrase from a transcript / CV / profile. Never fabricate.",
            },
          },
        },
      },
      concerns: {
        type: "array",
        minItems: 0,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["point", "evidence"],
          properties: {
            point: { type: "string" },
            evidence: { type: "string" },
          },
        },
      },
      to_probe: {
        type: "array",
        minItems: 0,
        maxItems: 10,
        items: { type: "string" },
        description: "Concrete questions the next interview should answer.",
      },
      compensation: {
        type: "object",
        additionalProperties: false,
        required: ["stated"],
        properties: {
          stated: {
            type: "boolean",
            description:
              "true ONLY when the transcript covered comp. Inferences from the JD don't count.",
          },
          range: { type: ["string", "null"] },
          currency: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
        },
      },
      recommendation: {
        type: "string",
        description:
          "2-3 sentences advising the hiring team on next steps (advance / pass / specific probes).",
      },
      input_provenance: {
        type: "object",
        additionalProperties: false,
        required: ["transcripts_used", "cv_used", "enrichment_used"],
        properties: {
          transcripts_used: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "title"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
              },
            },
          },
          cv_used: { type: "boolean" },
          enrichment_used: { type: "boolean" },
        },
      },
    },
  },
} as const;
