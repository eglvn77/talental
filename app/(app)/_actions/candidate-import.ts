"use server";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
  type CandidateSource,
} from "@/lib/hiring";
import {
  rowToCandidate,
  type CsvRow,
  type FieldMapping,
  type ImportSummary,
} from "@/lib/csv-import";
import { ensureAdmin, type ActionResult } from "./_shared";

/**
 * Bulk-insert candidates from a parsed CSV.
 *
 * The client has already parsed the CSV (via papaparse) and validated
 * the mapping locally. We re-validate here for safety, dedupe by email
 * against existing rows in the workspace, then insert in chunks of 500.
 *
 * Default source is applied to every row (single picker in the wizard).
 * Rows without a non-empty full_name are skipped silently. Rows whose
 * email collides with an existing candidate in the workspace are
 * skipped too — overwrite/update flow is a later phase.
 */
const VALID_SOURCES: CandidateSource[] = [
  "linkedin",
  "indeed",
  "referral",
  "direct",
  "other",
  "bulk_import",
];

const CHUNK_SIZE = 500;
const MAX_ROWS = 15_000;

export async function importCandidatesAction(input: {
  rows: CsvRow[];
  mapping: FieldMapping;
  defaultSource: CandidateSource;
}): Promise<ActionResult<{ summary: ImportSummary }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;

  if (!input.mapping.full_name) {
    return { ok: false, error: "Falta mapear el campo Nombre completo." };
  }
  if (!VALID_SOURCES.includes(input.defaultSource)) {
    return { ok: false, error: "Origen inválido." };
  }
  if (input.rows.length === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }
  if (input.rows.length > MAX_ROWS) {
    return {
      ok: false,
      error: `Máximo ${MAX_ROWS.toLocaleString("es-MX")} filas por import. Divide el archivo.`,
    };
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Transform every row, tallying skip reasons.
  const summary: ImportSummary = {
    total: input.rows.length,
    created: 0,
    skippedDuplicateEmail: 0,
    skippedNoName: 0,
    errors: [],
  };

  type Payload = {
    workspace_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    resume_url: string | null;
    default_source: CandidateSource;
  };

  const payloads: Payload[] = [];
  const emailsToCheck: string[] = [];

  for (let i = 0; i < input.rows.length; i++) {
    const transformed = rowToCandidate(input.rows[i], input.mapping);
    if (!transformed) {
      summary.skippedNoName += 1;
      continue;
    }
    payloads.push({
      workspace_id: workspaceId,
      full_name: transformed.full_name,
      email: transformed.email,
      phone: transformed.phone,
      linkedin_url: transformed.linkedin_url,
      resume_url: transformed.resume_url,
      default_source: input.defaultSource,
    });
    if (transformed.email) emailsToCheck.push(transformed.email);
  }

  // Dedup against existing candidates in the workspace by email. We
  // batch this lookup in chunks too because Postgres has a parameter
  // limit (~32k) and we want to be safe for 12k+ imports.
  const existingEmails = new Set<string>();
  for (let i = 0; i < emailsToCheck.length; i += CHUNK_SIZE) {
    const chunk = emailsToCheck.slice(i, i + CHUNK_SIZE);
    const { data, error } = await db
      .from("candidates")
      .select("email")
      .in("email", chunk);
    if (error) {
      return { ok: false, error: `Lookup falló: ${error.message.slice(0, 200)}` };
    }
    for (const r of data ?? []) {
      const e = (r as { email: string | null }).email;
      if (e) existingEmails.add(e);
    }
  }

  // Filter out duplicates AND remove any in-batch email collisions —
  // a CSV with the same email twice would otherwise blow up the second
  // insert at the unique constraint level. First occurrence wins.
  const seenEmails = new Set<string>();
  const finalPayloads: Payload[] = [];
  for (const p of payloads) {
    if (p.email) {
      if (existingEmails.has(p.email) || seenEmails.has(p.email)) {
        summary.skippedDuplicateEmail += 1;
        continue;
      }
      seenEmails.add(p.email);
    }
    finalPayloads.push(p);
  }

  // Batch insert.
  for (let i = 0; i < finalPayloads.length; i += CHUNK_SIZE) {
    const chunk = finalPayloads.slice(i, i + CHUNK_SIZE);
    const { error } = await db.from("candidates").insert(chunk);
    if (error) {
      // We've already done some inserts in previous chunks; the
      // summary reflects what got through up to this point.
      summary.errors.push({
        row: i,
        reason: error.message.slice(0, 300),
      });
      return {
        ok: true,
        data: { summary },
      };
    }
    summary.created += chunk.length;
  }

  revalidatePath("/candidates");
  return { ok: true, data: { summary } };
}
