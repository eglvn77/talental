import Anthropic from "@anthropic-ai/sdk";

export type ParsedExperience = {
  company: string;
  title: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  description?: string;
  /** Company logo (LinkedIn enrich only — not from PDF resume). */
  company_logo_url?: string;
  /** Marks the candidate's current role for badge / sort use. */
  is_current?: boolean;
  /** Duration in months (LinkedIn enrich; derived from dates for PDF). */
  duration_months?: number;
};

export type ParsedEducation = {
  school: string;
  degree?: string;
  field?: string;
  start_year?: string;
  end_year?: string;
  /** School logo (LinkedIn enrich only). */
  school_logo_url?: string;
};

export type ParsedProfile = {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  current_title?: string;
  current_company?: string;
  summary?: string;
  experience: ParsedExperience[];
  education: ParsedEducation[];
  skills: string[];
  languages: string[];
  /** Profile photo URL (LinkedIn enrich only). */
  profile_picture_url?: string;
};

const PARSE_TOOL: Anthropic.Tool = {
  name: "save_parsed_resume",
  description: "Persist the structured fields extracted from a candidate resume.",
  input_schema: {
    type: "object" as const,
    properties: {
      full_name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      location: {
        type: "string",
        description:
          "City and country in human-readable form, e.g. 'Mexico City, Mexico'",
      },
      linkedin_url: { type: "string" },
      current_title: { type: "string" },
      current_company: { type: "string" },
      summary: {
        type: "string",
        description: "1–3 sentence professional summary of the candidate.",
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            title: { type: "string" },
            start_date: { type: "string" },
            end_date: { type: "string" },
            location: { type: "string" },
            description: { type: "string" },
          },
          required: ["company", "title"],
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
            start_year: { type: "string" },
            end_year: { type: "string" },
          },
          required: ["school"],
        },
      },
      skills: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
    },
    required: ["experience", "education", "skills", "languages"],
  },
};

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/** Extract structured fields from raw resume text via Claude tool-use. */
export async function parseResumeText(
  resumeText: string,
): Promise<ParsedProfile> {
  // Trim huge resumes — model context isn't free and parsing past a couple
  // pages rarely improves quality.
  const trimmed = resumeText.slice(0, 30_000);

  const res = await client().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    // Deterministic: parsing the same resume twice should always return the
    // same structured output. Otherwise Claude can pick different "current"
    // jobs from CVs that list several roles and we end up with dedup
    // conflicts on identical files.
    temperature: 0,
    tools: [PARSE_TOOL],
    tool_choice: { type: "tool", name: PARSE_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Extract structured fields from this resume. Be conservative:",
              "- Use exact strings from the resume; don't paraphrase company or",
              "  school names.",
              "- Dates: prefer ISO-like strings (e.g. '2023-04', '2024-Present').",
              "- skills: deduped, lower-cased keywords (no sentences).",
              "- languages: human languages spoken, not programming.",
              "- summary: 1–3 sentences, factual, no marketing fluff.",
              "Use the save_parsed_resume tool to return the result.",
              "",
              "RESUME TEXT:",
              trimmed,
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const toolUse = res.content.find(
    (b) => b.type === "tool_use" && b.name === PARSE_TOOL.name,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return parsed resume");
  }
  return toolUse.input as ParsedProfile;
}
