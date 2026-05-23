import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import {
  createHostedAuthLink,
  UnipileError,
  type HostedAuthProvider,
} from "@/lib/integrations/unipile/client";
import { type ConnectedAccountProvider } from "@/lib/hiring";

/**
 * POST /api/integrations/unipile/connect
 *
 * Generates a one-time Hosted Auth Wizard URL for the signed-in user
 * to connect (or reconnect) a Unipile channel account. The flow:
 *
 *   1. Browser POSTs `{ providers, reconnectAccountId? }`.
 *   2. We call Unipile's Hosted Auth API with our user_id riding on
 *      the `name` field so the downstream account-callback webhook
 *      can correlate the connection back to our user.
 *   3. Return `{ url }`. The client navigates to it, the user picks
 *      a provider, authenticates, and lands back on the success/
 *      failure redirect URLs we configured.
 *
 * Body schema:
 *   - `providers`: optional array of `HostedAuthProvider`. Defaults
 *     to the three primary channels (LinkedIn, WhatsApp, Google).
 *     The wizard shows only the providers we list.
 *   - `reconnectAccountId`: optional. If present, the wizard skips
 *     the provider picker and goes straight to the auth flow for
 *     that account — used when an account's status flips to
 *     CREDENTIALS / DISCONNECTED.
 */
const PROVIDERS = [
  "LINKEDIN",
  "WHATSAPP",
  "GOOGLE",
  "OUTLOOK",
  "IMAP",
  "INSTAGRAM",
  "TELEGRAM",
] as const satisfies ReadonlyArray<ConnectedAccountProvider>;

const RequestSchema = z.object({
  providers: z.array(z.enum(PROVIDERS)).min(1).optional(),
  reconnectAccountId: z.string().min(1).optional(),
});

const DEFAULT_PROVIDERS: ReadonlyArray<HostedAuthProvider> = [
  "LINKEDIN",
  "WHATSAPP",
  "GOOGLE",
];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    // Critical config — webhooks won't fire without a callback URL.
    return NextResponse.json(
      { ok: false, error: "Server config: NEXT_PUBLIC_APP_URL missing" },
      { status: 500 },
    );
  }

  try {
    const link = await createHostedAuthLink({
      userId: session.id,
      providers: parsed.data.providers ?? DEFAULT_PROVIDERS,
      successUrl: `${appUrl}/settings/integrations?status=success`,
      failureUrl: `${appUrl}/settings/integrations?status=failure`,
      notifyUrl: `${appUrl}/api/webhooks/unipile/account-callback`,
      reconnectAccountId: parsed.data.reconnectAccountId,
    });
    return NextResponse.json({ ok: true, url: link.url, expiresOn: link.expiresOn });
  } catch (err) {
    if (err instanceof UnipileError) {
      // Surface Unipile's error to the client so the settings page
      // can show a readable message. Slice to avoid leaking large
      // payloads.
      return NextResponse.json(
        {
          ok: false,
          error: err.message.slice(0, 300),
          unipileStatus: err.status,
        },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unipile call failed";
    return NextResponse.json(
      { ok: false, error: message.slice(0, 300) },
      { status: 500 },
    );
  }
}
