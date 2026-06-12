import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared retry for Anthropic calls. Their API returns HTTP 529
 * "Overloaded" when saturated (frequent on Opus at peak) plus 429
 * rate-limits and transient 5xx — all retryable. Disable the SDK's own
 * retries (`maxRetries: 0` on the client) and use this so the backoff
 * and the final user-facing message are under our control.
 */

export const MAX_OVERLOAD_RETRIES = 5;

export function isTransient(e: unknown): boolean {
  if (e instanceof Anthropic.APIError) {
    const s = e.status ?? 0;
    return s === 529 || s === 429 || s >= 500;
  }
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("overloaded") || msg.includes("rate limit");
}

/**
 * Run an Anthropic call with exponential backoff (+jitter) on transient
 * failures. An overload that survives every retry surfaces as a clear,
 * retryable message instead of a raw 529.
 */
export async function withAnthropicRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_OVERLOAD_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt === MAX_OVERLOAD_RETRIES) break;
      const backoff = Math.min(2000 * 2 ** attempt, 20000);
      const jitter = Math.floor(backoff * 0.25 * Math.random());
      console.warn(
        `[anthropic:${label}] transient error (attempt ${attempt + 1}/${MAX_OVERLOAD_RETRIES}); retrying in ${backoff + jitter}ms`,
      );
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
  }
  if (isTransient(lastErr)) {
    throw new Error(
      "El servicio de IA está saturado en este momento (overloaded). Vuelve a intentarlo en unos segundos.",
    );
  }
  throw lastErr;
}
