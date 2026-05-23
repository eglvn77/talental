import { z } from "zod";

/**
 * Canonical shape for the Gemini-driven CV parser output.
 *
 * Field names mirror the denormalized columns on hiring.candidates
 * (current_company_name, current_position, years_of_experience, …)
 * so the bulk-save endpoint maps 1:1.
 *
 * `.nullable()` is preferred over `.optional()` because Gemini's
 * JSON-mode output uses explicit nulls for missing fields — easier
 * to reason about than "key absent".
 */

// `present` is the live-role marker per the prompt. zod permits null
// (no end_date known) or any string (we don't enforce YYYY-MM at this
// layer; downstream UI normalizes).
const dateOrPresent = z
  .union([z.literal("present"), z.string().max(20)])
  .nullable()
  .optional();

const dateOrNull = z.string().max(20).nullable().optional();

export const ParsedCvExperienceSchema = z
  .object({
    company: z.string().min(1).max(200),
    position: z.string().max(200).nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    start_date: dateOrNull,
    end_date: dateOrPresent,
    description: z.string().max(4000).nullable().optional(),
  })
  .strict();

export const ParsedCvEducationSchema = z
  .object({
    school: z.string().min(1).max(200),
    degree: z.string().max(200).nullable().optional(),
    field: z.string().max(200).nullable().optional(),
    start_date: dateOrNull,
    end_date: dateOrNull,
  })
  .strict();

export const ParsedCvSchema = z
  .object({
    full_name: z.string().min(1).max(200),
    email: z.string().max(200).nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    linkedin_url: z.string().max(500).nullable().optional(),
    headline: z.string().max(300).nullable().optional(),
    summary: z.string().max(3000).nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    current_company: z.string().max(200).nullable().optional(),
    current_position: z.string().max(200).nullable().optional(),
    total_years_experience: z.number().int().min(0).max(80).nullable().optional(),
    experience: z.array(ParsedCvExperienceSchema).default([]),
    education: z.array(ParsedCvEducationSchema).default([]),
    skills: z.array(z.string().max(80)).default([]),
    languages: z.array(z.string().max(80)).default([]),
  })
  .strict();

export type ParsedCv = z.infer<typeof ParsedCvSchema>;
export type ParsedCvExperience = z.infer<typeof ParsedCvExperienceSchema>;
export type ParsedCvEducation = z.infer<typeof ParsedCvEducationSchema>;
