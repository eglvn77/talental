/**
 * Unipile REST client — thin wrapper around the Unipile API.
 *
 * We deliberately don't depend on Unipile's npm SDK. The REST surface
 * we touch is small (≤10 endpoints) and going direct gives us
 * better control over headers, error shapes, and timeouts than the
 * SDK's `axios`-shaped interface would.
 *
 * Auth: `X-API-KEY` header carrying `UNIPILE_API_KEY`. Every Unipile
 * tenant gets a dedicated subdomain DSN (`apiNN.unipile.com:PORT`) —
 * we read that from `UNIPILE_DSN` so this code is portable across
 * regions.
 *
 * Docs: https://developer.unipile.com/
 */

import {
  type ConnectedAccountProvider,
  type ConnectedAccountStatus,
} from "@/lib/hiring";

// ============================================================
// Config + auth
// ============================================================

/**
 * Base URL for Unipile API calls. `UNIPILE_DSN` is the host:port pair
 * Unipile gave us in the tenant dashboard (e.g. `api33.unipile.com:16307`).
 * The "api" version path is appended for every call.
 */
function unipileBaseUrl(): string {
  const dsn = process.env.UNIPILE_DSN;
  if (!dsn) {
    throw new Error(
      "UNIPILE_DSN env var not set — required to reach the Unipile tenant.",
    );
  }
  // Unipile migrated to v2 across the board. Hosted auth endpoint
  // moved from /hosted/accounts/link → /auth/link, list/get accounts
  // stayed at /accounts but on the v2 path. v1 still serves but
  // accounts created via v2 wizard aren't visible in v1 listAccounts.
  return `https://${dsn}/api/v2`;
}

function unipileApiKey(): string {
  const key = process.env.UNIPILE_API_KEY;
  if (!key) {
    throw new Error(
      "UNIPILE_API_KEY env var not set — required to authenticate with Unipile.",
    );
  }
  return key;
}

// ============================================================
// Error shape — discriminated union for callers
// ============================================================

/**
 * Surface every failure as an explicit Error subclass so callers can
 * branch on `error.status` (Unipile returns 4xx with a JSON body) or
 * `error.cause` (network blip).
 */
export class UnipileError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "UnipileError";
    this.status = status;
    this.body = body;
  }
}

// ============================================================
// Core request helper
// ============================================================

type Method = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Internal: fire a request at Unipile with the API key header,
 * JSON-encode the body, parse the JSON response, throw a typed
 * `UnipileError` on non-2xx.
 *
 * Not exported — every public function in this module funnels through
 * this so we have a single place to add tracing, retries, or
 * timeouts later.
 */
async function unipileRequest<T>(
  path: string,
  method: Method = "GET",
  body?: unknown,
): Promise<T> {
  const url = `${unipileBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-API-KEY": unipileApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    // Server-side fetch by default doesn't cache, but be explicit
    // because Next 16 with Fluid Compute reuses function instances —
    // we never want a stale Unipile response.
    cache: "no-store",
  });
  const text = await res.text();
  // Unipile returns 200 with `{ ok: false, error: ... }` for some
  // soft-failures and 4xx with `{ message: ... }` for others. We treat
  // any non-2xx as a hard error and let the caller introspect.
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!res.ok) {
    const message =
      (payload &&
        typeof payload === "object" &&
        "message" in payload &&
        typeof (payload as { message: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `Unipile ${method} ${path} failed: ${res.status}`);
    throw new UnipileError(message, res.status, payload);
  }
  return payload as T;
}

// ============================================================
// Hosted Auth — link generation
// ============================================================

/**
 * Providers Unipile's Hosted Auth Wizard accepts. Same set as
 * `ConnectedAccountProvider` because every provider we support in
 * the DB has to round-trip through the wizard.
 */
export type HostedAuthProvider = ConnectedAccountProvider;

export interface CreateHostedAuthLinkInput {
  /**
   * Stable opaque identifier we set so we can correlate the
   * downstream account-callback webhook back to an ATS user. We pass
   * the ATS user_id here; Unipile echoes it on the `name` field of
   * the callback payload. Treat it like a tracking token, not a
   * display label.
   */
  userId: string;
  /**
   * Providers to expose in the wizard. Order is presentation-order
   * inside Unipile's hosted UI.
   */
  providers: ReadonlyArray<HostedAuthProvider>;
  /**
   * Where Unipile redirects after a successful connection. Should be
   * an absolute URL pointing back at the ATS.
   */
  successUrl: string;
  /**
   * Where Unipile redirects after a failed connection (user closed
   * the modal, OAuth denied, etc.). Absolute URL.
   */
  failureUrl: string;
  /**
   * Webhook Unipile POSTs to once the account is created or
   * reconnected. Public, no auth required, but should be HTTPS in
   * prod.
   */
  notifyUrl: string;
  /**
   * Pass to put the wizard into "reconnect" mode for a specific
   * account_id. Omit for a fresh connection. The wizard skips the
   * provider picker and goes straight to the auth flow for the
   * existing connection.
   */
  reconnectAccountId?: string;
  /**
   * Override the default link TTL of 30 minutes. Pass a Date in the
   * future. Unipile rejects links with `expiresOn` more than 24h out.
   */
  expiresOn?: Date;
}

export interface CreateHostedAuthLinkResult {
  /** URL the user opens to enter the Hosted Auth wizard. */
  url: string;
  /** ISO timestamp the link stops working. */
  expiresOn: string;
}

/**
 * Generate a one-time Hosted Auth Wizard URL for a user to connect (or
 * reconnect) one of their channel accounts. The returned URL is
 * single-use and expires in 30 minutes by default.
 *
 * See: https://developer.unipile.com/docs/hosted-auth
 */
export async function createHostedAuthLink(
  input: CreateHostedAuthLinkInput,
): Promise<CreateHostedAuthLinkResult> {
  const expiresOn = (input.expiresOn ?? new Date(Date.now() + 30 * 60_000))
    .toISOString();

  // v2 shape: single redirect_uri (no more separate success/failure
  // URLs, no webhook required for the basic flow). Unipile passes
  // account_id + provider via query string on the redirect, OR
  // error_type/error_detail on failure. Our callback route reads
  // those directly — no more webhook delivery dependency.
  const body: Record<string, unknown> = {
    providers:
      input.providers === undefined
        ? "*"
        : Array.isArray(input.providers)
          ? input.providers
          : input.providers,
    redirect_uri: input.successUrl, // single redirect for both cases
    expires_on: expiresOn,
  };
  if (input.reconnectAccountId) {
    body.reconnect_account = input.reconnectAccountId;
  }

  // v2 endpoint name. Response includes `link` (the URL the user
  // opens) instead of v1's `url`. Tolerate both for forward-compat.
  const res = await unipileRequest<{
    link?: string;
    url?: string;
    object?: string;
  }>("/auth/link", "POST", body);
  const link = res.link ?? res.url ?? "";
  if (!link) {
    throw new UnipileError(
      "Unipile didn't return a link URL",
      0,
      res,
    );
  }
  return { url: link, expiresOn };
}

// ============================================================
// Account read — used by the account-callback webhook to backfill
// metadata after Unipile reports a successful connection.
// ============================================================

/**
 * Per-provider shapes we care about — Unipile returns a much larger
 * payload, but only these fields land in `account_metadata` today.
 */
export interface UnipileAccount {
  id: string;
  type: string; // provider key (LINKEDIN, GOOGLE, etc.)
  name?: string;
  /** Inbox providers (GOOGLE/OUTLOOK/IMAP). */
  email?: string;
  /** Messaging providers (WHATSAPP/TELEGRAM). */
  phone?: string;
  /** LinkedIn-specific. */
  public_id?: string;
  /** Free-form, surfaces as a status field on some providers. */
  status?: string;
  // Everything else Unipile returns we just preserve as-is so the
  // webhook handler can pick what it wants for `account_metadata`.
  [key: string]: unknown;
}

/**
 * Fetch the full Unipile-side representation of an account, used by
 * the account-callback webhook to populate `account_metadata` with
 * the provider-specific identity payload (email/phone/public_id).
 */
export function getAccount(accountId: string): Promise<UnipileAccount> {
  return unipileRequest<UnipileAccount>(
    `/accounts/${encodeURIComponent(accountId)}`,
  );
}

/**
 * List every account this Unipile tenant has. Used for admin/recon
 * tooling, not for per-request lookups.
 */
export function listAccounts(): Promise<{
  items: UnipileAccount[];
  cursor: string | null;
}> {
  return unipileRequest<{ items: UnipileAccount[]; cursor: string | null }>(
    "/accounts",
  );
}

// ============================================================
// Status mapping — translate Unipile's status field to our enum
// ============================================================

/**
 * Unipile sends back richer status strings than our enum captures
 * (CONNECTED, ERROR_CREDENTIALS, ERROR_DISCONNECTED, etc.). This maps
 * each known value back onto our DB-level `ConnectedAccountStatus`.
 *
 * Used by the status-changes webhook.
 */
export function mapUnipileStatus(raw: string): ConnectedAccountStatus {
  switch (raw.toUpperCase()) {
    case "OK":
    case "CONNECTED":
    case "CREATION_SUCCESS":
    case "RECONNECTED":
      return "OK";
    case "CREDENTIALS":
    case "ERROR_CREDENTIALS":
    case "OUTDATED_CREDENTIALS":
      return "CREDENTIALS";
    case "DISCONNECTED":
    case "ERROR_DISCONNECTED":
      return "DISCONNECTED";
    case "PENDING":
      return "PENDING";
    default:
      return "ERROR";
  }
}
