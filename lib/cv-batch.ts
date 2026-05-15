import { type ParsedProfile } from "./resume-parse";

/**
 * Shared types for the bulk CV upload flow. Used by both server actions
 * (bulkParseCVsAction + commitBulkCVsAction) and the client UI.
 *
 * The flow is two-phase:
 *   1. PARSE  — client uploads PDFs, server stages them under `_pending/`,
 *               extracts text, calls Claude Haiku, builds dedup conflicts.
 *   2. COMMIT — client (optionally after the user resolves conflicts) sends
 *               back a list of decisions; server moves PDFs to final paths
 *               and writes candidates + applications atomically.
 */

export const BULK_MAX_FILES = 10;
export const BULK_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** A single successfully-parsed CV awaiting commit. */
export type BulkParseItem = {
  tempId: string;
  filename: string;
  storagePath: string; // `${workspace_id}/_pending/${nanoid}/${safe_name}`
  parsed: ParsedProfile;
};

export type BulkFailedItem = {
  filename: string;
  reason: string;
};

/**
 * A group of CVs (and/or an existing candidate) that share an email and
 * therefore need manual resolution before commit. Email match is exact.
 */
export type BulkConflictGroup = {
  groupId: string;
  email: string;
  /** Items from THIS batch that share the email. Always >= 1 when groupId exists. */
  items: BulkParseItem[];
  /** Existing candidate row if the email already exists in the workspace. */
  existing: BulkExistingCandidate | null;
};

export type BulkExistingCandidate = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  parsed_profile: ParsedProfile | null;
};

export type BulkParseResult = {
  items: BulkParseItem[];
  failed: BulkFailedItem[];
  conflicts: BulkConflictGroup[];
};

/** Scalar fields the user can pick a value for in the resolution UI. */
export type ResolvedScalarFields = Partial<{
  full_name: string;
  email: string;
  phone: string;
  linkedin_url: string;
  location: string;
  current_title: string;
  current_company: string;
  summary: string;
}>;

/** Per-group user decision after resolution UI. */
export type BulkCommitDecision =
  | {
      kind: "create-new";
      tempId: string;
    }
  | {
      kind: "create-merged";
      tempIds: string[]; // intra-batch merge: 1 new candidate from N items
      primaryTempId: string; // whose PDF to keep
      fields: ResolvedScalarFields;
    }
  | {
      kind: "update-existing";
      candidateId: string;
      tempIds: string[]; // cross-batch merge: update existing with N items
      primaryTempId: string;
      fields: ResolvedScalarFields;
    }
  | {
      kind: "discard";
      tempIds: string[]; // user said don't import these
    };

export type BulkCommitResult = {
  created: number;
  updated: number;
  errors: { tempId?: string; error: string }[];
};

/**
 * Merge two parsed arrays by value identity (string === string for skills
 * and languages). Used server-side when committing merged items and
 * client-side for preview.
 */
export function mergeStringArrays(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...a, ...b]) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
