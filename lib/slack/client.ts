import "server-only";

/**
 * Thin wrapper around the Slack Web API (just the methods we need).
 * Uses `SLACK_BOT_TOKEN` (xoxb-...) for outbound calls; verification
 * of inbound webhooks lives in lib/slack/verify.ts.
 *
 * No SDK dep — Slack's REST API is small enough that `fetch`-with-
 * types is cleaner than dragging in @slack/web-api.
 */

const SLACK_BASE = "https://slack.com/api";

function token(): string {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error("Missing SLACK_BOT_TOKEN");
  return t;
}

type PostMessageInput = {
  channel: string;
  text: string;
  /** Reply in a thread when present (Slack `thread_ts` field). */
  thread_ts?: string | null;
  /** Slack Block Kit payload for richer formatting. */
  blocks?: unknown[];
};

type SlackOk<T> = { ok: true } & T;
type SlackErr = { ok: false; error: string };

/**
 * Post a message to a channel (and optionally a thread). Returns
 * the API response — including `ts` so callers can thread replies
 * later, or `error` if Slack rejected the call (bad scope, missing
 * channel, archived, etc.).
 */
export async function slackPostMessage(
  input: PostMessageInput,
): Promise<SlackOk<{ ts: string; channel: string }> | SlackErr> {
  const res = await fetch(`${SLACK_BASE}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channel,
      text: input.text,
      ...(input.thread_ts ? { thread_ts: input.thread_ts } : {}),
      ...(input.blocks ? { blocks: input.blocks } : {}),
    }),
  });
  const data = (await res.json()) as
    | SlackOk<{ ts: string; channel: string }>
    | SlackErr;
  return data;
}

/** Identity of the bot (for filtering out its own messages on the
 *  events webhook). Cached at module level — the bot id never
 *  changes for a given token. */
let cachedBotUserId: string | null = null;

export async function slackBotUserId(): Promise<string | null> {
  if (cachedBotUserId) return cachedBotUserId;
  const res = await fetch(`${SLACK_BASE}/auth.test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data = (await res.json()) as
    | SlackOk<{ user_id: string; bot_id?: string }>
    | SlackErr;
  if (!data.ok) return null;
  cachedBotUserId = data.user_id;
  return data.user_id;
}
