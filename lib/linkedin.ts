/**
 * Canonical LinkedIn URL handling — ONE source of truth shared by every
 * candidate write path (careers apply, manual add, CSV import, DfB2B
 * enrichment). Inconsistent normalization across these paths used to
 * create duplicate candidates for the same profile (e.g. a trailing
 * slash made ".../in/foo/" and ".../in/foo" two distinct rows that the
 * per-workspace unique index couldn't catch).
 *
 * Pure + dependency-free so it's safe to import from client or server.
 */

/**
 * Canonicalize a LinkedIn profile/company URL to a stable form:
 *   https://www.linkedin.com/<lowercased path, no trailing slash>
 * Strips protocol/host variants, query, fragment, and trailing slash.
 * Returns null for anything that isn't a linkedin.com URL.
 */
export function canonicalizeLinkedinUrl(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const path = u.pathname.toLowerCase().replace(/\/+$/, "");
  if (!path || path === "") return null;
  return `https://www.linkedin.com${path}`;
}

/**
 * The public-id slug from a LinkedIn profile URL ("john-doe" from
 * ".../in/john-doe"). Lowercased. Returns null when the URL isn't a
 * personal profile (/in/…) or isn't a LinkedIn URL at all.
 */
export function linkedinPublicId(
  input: string | null | undefined,
): string | null {
  const url = canonicalizeLinkedinUrl(input);
  if (!url) return null;
  const m = /\/in\/([^/?#]+)/.exec(url);
  return m ? m[1] : null;
}

/** Convenience: canonical url + public id in one call. */
export function canonicalLinkedin(input: string | null | undefined): {
  url: string | null;
  publicId: string | null;
} {
  const url = canonicalizeLinkedinUrl(input);
  return { url, publicId: url ? linkedinPublicId(url) : null };
}
