import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Centralised Anthropic client factory. Two modes:
 *
 * 1. **Vercel AI Gateway** (preferred in production) — when
 *    `AI_GATEWAY_API_KEY` is set, route through the Vercel gateway
 *    so we get unified observability, fallbacks and zero-data-
 *    retention by default. Same Anthropic SDK call shape.
 *
 * 2. **Anthropic direct** — when only `ANTHROPIC_API_KEY` is set
 *    (local dev), talk to api.anthropic.com directly. Identical
 *    request/response semantics, no observability layer.
 *
 * Callers don't care which path the env picked — they get the same
 * Anthropic SDK client back. This lets us swap to the gateway later
 * by adding the env var without touching consumer code.
 */
let cached: Anthropic | null = null;

export function anthropicClient(): Anthropic {
  if (cached) return cached;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (gatewayKey) {
    // Vercel AI Gateway exposes an Anthropic-compatible API at this
    // path; the SDK only needs a different baseURL + the gateway key.
    cached = new Anthropic({
      apiKey: gatewayKey,
      baseURL: "https://ai-gateway.vercel.sh/v1/anthropic",
    });
    return cached;
  }
  const direct = process.env.ANTHROPIC_API_KEY;
  if (!direct) {
    throw new Error(
      "Missing AI_GATEWAY_API_KEY (preferred) or ANTHROPIC_API_KEY",
    );
  }
  cached = new Anthropic({ apiKey: direct });
  return cached;
}

/** True if AI Gateway env is configured. Used by the cockpit to
 *  surface a small badge so the operator knows which path is live. */
export function isAiGatewayActive(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}
