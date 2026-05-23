import { z } from "zod";

/**
 * Strict shape for the CV parser output. This is the canonical
 * schema used by:
 *   - The Claude tool-use call (POST /api/candidates/parse-cv)
 *   - The preview-cards UI in /candidates/import
 *   - The batch save endpoint that writes into hiring.candidates +
 *     hiring.candidate_experience + hiring.candidate_education
 *
 * Field names mirror the denormalized columns added in the sourcing
 * cache migration (current_company_name, current_position,
 * years_of_experience, etc.) — see supabase/migrations/...
 * sourcing_cache_layer_schema.sql.
 *
 * All fields except experience/education/skills/languages arrays are
 * optional because real CVs vary widely. The endpoint enforces at
 * MINIMUM that a name was extracted; everything else can be empty.
 */

export const ParsedCvExperienceSchema = z
  .object({
    company: z.string().min(1).max(200),
    position: z.string().max(200).optional(),
    start_date: z.string().max(20).optional(),
    end_date: z.string().max(20).optional(),
    description: z.string().max(2000).optional(),
    location: z.string().max(200).optional(),
    is_current: z.boolean().optional(),
  })
  .strict();

export const ParsedCvEducationSchema = z
  .object({
    school: z.string().min(1).max(200),
    degree: z.string().max(200).optional(),
    field: z.string().max(200).optional(),
    start_date: z.string().max(20).optional(),
    end_date: z.string().max(20).optional(),
  })
  .strict();

export const ParsedCvSchema = z
  .object({
    full_name: z.string().min(1).max(200),
    email: z.string().max(200).optional(),
    phone: z.string().max(50).optional(),
    linkedin_url: z.string().max(500).optional(),
    headline: z.string().max(300).optional(),
    summary: z.string().max(3000).optional(),
    location: z.string().max(200).optional(),
    current_company: z.string().max(200).optional(),
    current_position: z.string().max(200).optional(),
    total_years_experience: z.number().int().min(0).max(80).optional(),
    experience: z.array(ParsedCvExperienceSchema).default([]),
    education: z.array(ParsedCvEducationSchema).default([]),
    skills: z.array(z.string().max(80)).default([]),
    languages: z.array(z.string().max(80)).default([]),
  })
  .strict();

export type ParsedCv = z.infer<typeof ParsedCvSchema>;
export type ParsedCvExperience = z.infer<typeof ParsedCvExperienceSchema>;
export type ParsedCvEducation = z.infer<typeof ParsedCvEducationSchema>;

/** Anthropic tool schema mirroring ParsedCvSchema, used to constrain
 *  the Claude response. Kept in sync manually — when adding/removing
 *  fields, update both. */
export const PARSE_CV_TOOL = {
  name: "save_parsed_cv",
  description:
    "Persist the structured fields extracted from a candidate's resume (CV).",
  input_schema: {
    type: "object" as const,
    properties: {
      full_name: {
        type: "string",
        description: "The candidate's full name as it appears at the top of the CV.",
      },
      email: { type: "string" },
      phone: {
        type: "string",
        description: "Phone with country code if present, no extra formatting.",
      },
      linkedin_url: {
        type: "string",
        description: "Full LinkedIn profile URL if present in the CV.",
      },
      headline: {
        type: "string",
        description:
          "Short one-line professional headline. Often what they put under their name. If not present, infer from the most recent role title + company.",
      },
      summary: {
        type: "string",
        description:
          "2-4 sentence professional summary. If the CV has a 'Profile' / 'About' / 'Summary' section, use that verbatim. Otherwise synthesize from the most recent 1-2 roles.",
      },
      location: {
        type: "string",
        description: "City, country in human-readable form (e.g. 'Mexico City, Mexico').",
      },
      current_company: {
        type: "string",
        description: "Company name of the candidate's most recent role.",
      },
      current_position: {
        type: "string",
        description: "Title of the candidate's most recent role.",
      },
      total_years_experience: {
        type: "integer",
        description:
          "Sum of years across all listed experience entries (rounded). If unclear, leave unset.",
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            position: { type: "string" },
            start_date: {
              type: "string",
              description: "YYYY or YYYY-MM. 'Present' or empty when ongoing.",
            },
            end_date: {
              type: "string",
              description:
                "YYYY or YYYY-MM. Leave unset for current/ongoing roles (also set is_current=true).",
            },
            location: { type: "string" },
            description: {
              type: "string",
              description:
                "Bullet points or paragraph describing the role. Preserve key achievements + metrics.",
            },
            is_current: {
              type: "boolean",
              description:
                "True for the candidate's currently-held role. Exactly one role should be current.",
            },
          },
          required: ["company"],
          additionalProperties: false,
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            school: { type: "string" },
            degree: { type: "string" },
            field: { type: "string" },
            start_date: {
              type: "string",
              description: "YYYY or YYYY-MM.",
            },
            end_date: {
              type: "string",
              description: "YYYY or YYYY-MM.",
            },
          },
          required: ["school"],
          additionalProperties: false,
        },
      },
      skills: {
        type: "array",
        items: { type: "string" },
        description: "Hard skills + software + frameworks. No soft skills.",
      },
      languages: {
        type: "array",
        items: { type: "string" },
        description: "Spoken languages. Include proficiency if mentioned (e.g. 'English (C1)').",
      },
    },
    required: ["full_name", "experience", "education", "skills", "languages"],
    additionalProperties: false,
  },
} as const;
