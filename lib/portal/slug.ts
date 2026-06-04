import { randomBytes } from "node:crypto";

/**
 * URL-safe 22-char slug (base64url of 16 random bytes, no padding).
 * Collisions astronomically unlikely; the DB still has a unique index
 * on portal_tokens.slug as a hard guarantee.
 */
export function newPortalSlug(): string {
  return randomBytes(16).toString("base64url");
}
