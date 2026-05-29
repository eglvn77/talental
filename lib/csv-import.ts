/**
 * Shared types + auto-mapping heuristic for the candidate CSV import.
 * No "use server" / no React — used by both the client wizard and the
 * server-side import action.
 */

/** Candidate fields a CSV column can map to. `skip` means ignore the
 *  column. We mirror the writable subset of CandidateRow that an import
 *  should set; default_source is handled separately as a single picker
 *  applied to the whole batch. */
export const CANDIDATE_FIELDS = [
  "skip",
  "full_name",
  "email",
  "phone",
  "linkedin_url",
  "resume_url",
] as const;

export type CandidateField = (typeof CANDIDATE_FIELDS)[number];

export const FIELD_LABELS: Record<Exclude<CandidateField, "skip">, string> = {
  full_name: "Nombre completo",
  email: "Correo",
  phone: "Teléfono",
  linkedin_url: "LinkedIn",
  resume_url: "URL del CV",
};

/**
 * Guess which candidate field a CSV column header probably maps to.
 * Lowercases + strips punctuation, then checks against a list of
 * known patterns. Returns "skip" if nothing matches confidently.
 */
export function suggestFieldFor(header: string): CandidateField {
  const h = header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // Order matters: more specific patterns first.
  if (/\b(linkedin|li url|profile url)\b/.test(h)) return "linkedin_url";
  if (/\b(resume|cv) (url|link)\b/.test(h) || /\bcv\b/.test(h)) return "resume_url";
  if (/\b(email|e mail|correo|mail)\b/.test(h)) return "email";
  if (/\b(phone|tel|telefono|movil|celular|whatsapp|wa)\b/.test(h))
    return "phone";
  if (
    /\b(full name|nombre completo|nombre y apellido|candidate)\b/.test(h) ||
    /^(nombre|name)$/.test(h)
  )
    return "full_name";
  return "skip";
}

/** A single row from the CSV — keys are the original headers, values are
 *  raw strings (papaparse default). We keep them as strings and clean
 *  per-field during transformation. */
export type CsvRow = Record<string, string>;

/** Mapping from candidate field → CSV column header. `null` means the
 *  field isn't mapped (skipped). full_name being null is invalid — every
 *  candidate needs a name. */
export type FieldMapping = Partial<
  Record<Exclude<CandidateField, "skip">, string | null>
>;

/** Result of the dry-run / actual import. */
export type ImportSummary = {
  total: number;
  /** Successfully inserted. */
  created: number;
  /** Skipped because email already existed in the workspace. */
  skippedDuplicateEmail: number;
  /** Skipped because linkedin_url already existed in the workspace. */
  skippedDuplicateLinkedin?: number;
  /** Skipped because the full_name column was empty. */
  skippedNoName: number;
  /** First N error rows for debugging — we don't surface every error
   *  individually, the user just wants to know "did it work". */
  errors: Array<{ row: number; reason: string }>;
};

/**
 * Transform a CSV row into a candidate insert payload using the field
 * mapping. Returns null if the row should be skipped (no name).
 *
 * Cleans whitespace, normalizes empty strings to null, and trims
 * URLs/emails to a reasonable length so a bad row can't blow up the DB.
 */
export function rowToCandidate(
  row: CsvRow,
  mapping: FieldMapping,
): {
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
} | null {
  const nameCol = mapping.full_name;
  if (!nameCol) return null;
  const fullName = (row[nameCol] ?? "").trim();
  if (!fullName) return null;

  function get(field: Exclude<CandidateField, "skip" | "full_name">): string | null {
    const col = mapping[field];
    if (!col) return null;
    const v = (row[col] ?? "").trim();
    if (!v) return null;
    // Soft length caps so a malformed cell can't break the row.
    return v.slice(0, field === "linkedin_url" || field === "resume_url" ? 500 : 200);
  }

  return {
    full_name: fullName.slice(0, 200),
    email: get("email")?.toLowerCase() ?? null,
    phone: get("phone"),
    linkedin_url: get("linkedin_url"),
    resume_url: get("resume_url"),
  };
}
