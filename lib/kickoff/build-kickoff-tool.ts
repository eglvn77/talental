/**
 * Phase 4a-i — build the `populate_kickoff` tool's `input_schema`
 * from the workspace's enabled `resource_definitions.schema_json`
 * rows + a static set of kickoff-level properties that are NOT
 * per-resource (`job_title`, `structured_facts`, `jd_public_description`,
 * `overview`, `kickoff_checklist`, `assessment_content`,
 * `source_conflicts`, `linkedin_post`).
 *
 * Output for the default 7 definitions in default order matches the
 * legacy `POPULATE_KICKOFF_TOOL.input_schema` shape — that's the
 * deep-equal parity test the migration backfill needs to pass before
 * `run.ts` switches to this builder.
 */

export type DefinitionSchemaInput = {
  key: string;
  schema_json: unknown;
  position: number;
};

/** Kickoff-level properties that are NOT exposed as resource_definitions.
 *  They're outputs of the kickoff itself, not editable as Resources. */
const STATIC_PROPERTIES = {
  job_title: {
    type: "string",
    description:
      "The role's job title, e.g. 'Senior Backend Engineer' or 'Director de Marketing'. If the intake/materials already state a title, echo it verbatim. If not, INFER a concise, conventional title from the role described in the intake. Never leave this empty. Match the language of the role's market.",
  },
  structured_facts: {
    type: "object",
    additionalProperties: false,
    required: [
      "work_modality",
      "contract_type",
      "working_hours",
      "salary_min",
      "salary_max",
      "salary_currency",
      "salary_period",
    ],
    description:
      "Structured facts extracted from the intake/materials so the ATS can fill the vacante's own columns. Use null whenever the materials don't clearly state a value — do NOT guess. The ATS only writes these when the recruiter left the field blank.",
    properties: {
      work_modality: {
        type: ["string", "null"],
        enum: ["remote", "hybrid", "onsite", null],
        description:
          "remote = fully remote; hybrid = mix; onsite = in-office. null if not stated.",
      },
      contract_type: {
        type: ["string", "null"],
        enum: ["permanent", "temporary", "contractor", "internship", null],
        description:
          "The employment type as ONE of these codes (not a sentence). permanent = full employee/indefinite; temporary = fixed-term; contractor = freelance/EOR/B2B; internship. null if not stated.",
      },
      working_hours: {
        type: ["string", "null"],
        enum: ["full_time", "part_time", "flexible", null],
        description:
          "Schedule as ONE of these codes (not a sentence). full_time, part_time, or flexible. null if not stated.",
      },
      salary_min: {
        type: ["number", "null"],
        description:
          "Lower bound of the salary range as a plain number, no currency symbol. null if not stated.",
      },
      salary_max: {
        type: ["number", "null"],
        description:
          "Upper bound of the salary range. null if not stated or single figure (then put it in salary_min).",
      },
      salary_currency: {
        type: ["string", "null"],
        description: "3-letter ISO currency code (e.g. MXN, USD). null if not stated.",
      },
      salary_period: {
        type: ["string", "null"],
        enum: ["monthly", "annual", "weekly", "hourly", null],
        description: "Pay period for the figures above. null if not stated.",
      },
    },
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
} as const;

/** Order of properties in the assembled tool. Matches the legacy
 *  monolith for parity. Definitions slot in between `overview` and
 *  `linkedin_post`. */
const STATIC_BEFORE_RESOURCES = [
  "job_title",
  "structured_facts",
  "jd_public_description",
  "overview",
];
const STATIC_AFTER_RESOURCES = [
  "linkedin_post",
  "kickoff_checklist",
  "assessment_content",
  "source_conflicts",
];

/**
 * Build the populate_kickoff tool. The tool description + name stay
 * stable; only `input_schema.properties` and `required` are assembled
 * from the workspace's enabled definitions.
 */
export function buildKickoffTool(definitions: DefinitionSchemaInput[]) {
  const sortedDefs = [...definitions].sort(
    (a, b) => a.position - b.position || a.key.localeCompare(b.key),
  );
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const k of STATIC_BEFORE_RESOURCES) {
    properties[k] = STATIC_PROPERTIES[k as keyof typeof STATIC_PROPERTIES];
    required.push(k);
  }
  for (const d of sortedDefs) {
    properties[d.key] = d.schema_json;
    required.push(d.key);
  }
  for (const k of STATIC_AFTER_RESOURCES) {
    properties[k] = STATIC_PROPERTIES[k as keyof typeof STATIC_PROPERTIES];
    // linkedin_post is the only optional kickoff-level prop.
    if (k !== "linkedin_post") required.push(k);
    else required.push(k); // keep parity — the legacy schema had it required too
  }

  return {
    name: "populate_kickoff",
    description:
      "Submit the complete recruiting package for the role. Call this exactly once with all sections populated according to the master prompt's content rules.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required,
      properties,
    },
  } as const;
}
