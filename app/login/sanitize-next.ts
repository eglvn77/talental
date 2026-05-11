/**
 * Validates a `?next=` redirect target to prevent open-redirect attacks.
 *
 * Accepts only relative paths that:
 *   - start with a single `/`
 *   - do NOT start with `//` (protocol-relative — would navigate off-origin)
 *   - do NOT embed `://` (defense in depth against weird parser quirks)
 *   - contain no control characters
 *
 * Anything else falls back to `/jobs`.
 */
export const DEFAULT_NEXT = "/jobs";

export function sanitizeNext(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return DEFAULT_NEXT;
  if (!next.startsWith("/")) return DEFAULT_NEXT;
  if (next.startsWith("//")) return DEFAULT_NEXT;
  if (next.includes("://")) return DEFAULT_NEXT;
  // eslint-disable-next-line no-control-regex
  if (/[\r\n\t\x00]/.test(next)) return DEFAULT_NEXT;
  return next;
}
