import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Slack inbound webhook signature. Slack signs every
 * request with `X-Slack-Signature` and `X-Slack-Request-Timestamp`;
 * we recompute the HMAC over the raw body and compare in constant
 * time. Stale timestamps (>5min) are rejected to prevent replay.
 *
 * Returns `{ ok: true }` when valid, `{ ok: false, reason }` with a
 * machine-readable reason on failure. Caller decides whether to
 * 401 or 400.
 */
export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_secret" | "no_sig" | "stale" | "mismatch" };

const MAX_SKEW_SECONDS = 60 * 5;

export function verifySlackSignature(args: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): VerifyResult {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!args.signature || !args.timestamp) {
    return { ok: false, reason: "no_sig" };
  }
  const tsNum = Number(args.timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "no_sig" };
  const skew = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (skew > MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };

  const sigBasestring = `v0:${args.timestamp}:${args.rawBody}`;
  const expected =
    "v0=" + createHmac("sha256", secret).update(sigBasestring).digest("hex");

  // Constant-time comparison; both strings must be same length to
  // avoid timingSafeEqual throwing.
  const a = Buffer.from(args.signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}
