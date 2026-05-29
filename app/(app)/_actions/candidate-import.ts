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
import { requireCurrentTeamMember } from "@/lib/auth/team";
import { canonicalizeLinkedinUrl, linkedinPublicId } from "@/lib/linkedin";
import { type ActionResult } from "./_shared";

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
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const createdByTeamMemberId = guard.data.id;

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
    skippedDuplicateLinkedin: 0,
    skippedNoName: 0,
    errors: [],
  };

  type Payload = {
    workspace_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    linkedin_public_id: string | null;
    resume_url: string | null;
    default_source: CandidateSource;
    created_by_team_member_id: string;
  };

  const payloads: Payload[] = [];
  const emailsToCheck: string[] = [];
  const pidsToCheck: string[] = [];

  for (let i = 0; i < input.rows.length; i++) {
    const transformed = rowToCandidate(input.rows[i], input.mapping);
    if (!transformed) {
      summary.skippedNoName += 1;
      continue;
    }
    // Canonicalize email (lowercase) + LinkedIn so dedup matches what
    // the enrichment/careers/manual paths store and the per-workspace
    // unique indexes enforce — no case/trailing-slash logical dupes.
    const email = transformed.email?.trim().toLowerCase() || null;
    const linkedinUrl = canonicalizeLinkedinUrl(transformed.linkedin_url);
    const pid = linkedinPublicId(linkedinUrl);
    payloads.push({
      workspace_id: workspaceId,
      full_name: transformed.full_name,
      email,
      phone: transformed.phone,
      linkedin_url: linkedinUrl,
      linkedin_public_id: pid,
      resume_url: transformed.resume_url,
      default_source: input.defaultSource,
      created_by_team_member_id: createdByTeamMemberId,
    });
    if (email) emailsToCheck.push(email);
    if (pid) pidsToCheck.push(pid);
  }

  // Dedup against existing candidates by email AND linkedin_public_id
  // (both carry per-workspace unique indexes — a collision on either
  // would otherwise abort the insert). Batched lookups stay under
  // Postgres's parameter limit for 12k+ imports.
  const existingEmails = await fetchExisting(db, "email", emailsToCheck);
  const existingPids = await fetchExisting(
    db,
    "linkedin_public_id",
    pidsToCheck,
  );

  // Filter out existing + in-batch collisions on either key. First
  // occurrence wins. A row missing both keys can't collide, so it
  // always passes (fuzzy dedup of those is the merge UI's job — part B).
  const seenEmails = new Set<string>();
  const seenPids = new Set<string>();
  const finalPayloads: Payload[] = [];
  for (const p of payloads) {
    if (p.email && (existingEmails.has(p.email) || seenEmails.has(p.email))) {
      summary.skippedDuplicateEmail += 1;
      continue;
    }
    if (
      p.linkedin_public_id &&
      (existingPids.has(p.linkedin_public_id) ||
        seenPids.has(p.linkedin_public_id))
    ) {
      summary.skippedDuplicateLinkedin =
        (summary.skippedDuplicateLinkedin ?? 0) + 1;
      continue;
    }
    if (p.email) seenEmails.add(p.email);
    if (p.linkedin_public_id) seenPids.add(p.linkedin_public_id);
    finalPayloads.push(p);
  }

  // Batch insert. If a chunk fails (e.g. an unforeseen constraint on a
  // single row), retry that chunk row-by-row so ONE bad row never drops
  // the other 499 — the import always runs to completion.
  for (let i = 0; i < finalPayloads.length; i += CHUNK_SIZE) {
    const chunk = finalPayloads.slice(i, i + CHUNK_SIZE);
    const { error } = await db.from("candidates").insert(chunk);
    if (!error) {
      summary.created += chunk.length;
      continue;
    }
    // Chunk failed — fall back to per-row inserts.
    for (let j = 0; j < chunk.length; j++) {
      const { error: rowErr } = await db.from("candidates").insert(chunk[j]);
      if (rowErr) {
        if (summary.errors.length < 50) {
          summary.errors.push({
            row: i + j,
            reason: rowErr.message.slice(0, 200),
          });
        }
      } else {
        summary.created += 1;
      }
    }
  }

  revalidatePath("/candidates");
  return { ok: true, data: { summary } };
}

/** Batched existence lookup for a unique-keyed column. Returns the set
 *  of values already present in the workspace (RLS-scoped). */
async function fetchExisting(
  db: Awaited<ReturnType<typeof hiring>>,
  column: "email" | "linkedin_public_id",
  values: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const { data } = await db.from("candidates").select(column).in(column, chunk);
    for (const r of data ?? []) {
      const v = (r as Record<string, string | null>)[column];
      if (v) out.add(v);
    }
  }
  return out;
}
