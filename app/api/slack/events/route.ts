import { NextResponse } from "next/server";
import { hiring } from "@/lib/hiring/clients";
import { verifySlackSignature } from "@/lib/slack/verify";
import { slackBotUserId, slackPostMessage } from "@/lib/slack/client";
import { runAgent } from "@/lib/agents/run";

/**
 * Slack Events API endpoint. One Slack app subscribes to:
 *   - `url_verification` (one-time handshake when the URL is added)
 *   - `app_mention` (user @-mentions the bot)
 *   - `message.channels` (any message in a channel the bot is in)
 *
 * Routing: incoming event → look up `hiring.agents` by
 * `slack_channel_id = event.channel`. Match found AND agent is
 * active AND runtime='in_app' → trigger a run with the message
 * text, post the response back in the same thread.
 *
 * No-match channels are silently ignored — the bot may be in
 * unrelated channels (e.g. announcements) and we don't want to
 * spew responses there.
 *
 * Slack retries unacknowledged events; we reply 200 within 3s by
 * acking BEFORE the heavy work (model call) so the retry storm
 * never starts. The run continues server-side after the response
 * goes out — Vercel keeps the function alive for the full
 * maxDuration.
 */
export const maxDuration = 120;

type SlackEnvelope = {
  type: string;
  token?: string;
  challenge?: string;
  event?: SlackEvent;
  event_id?: string;
  event_time?: number;
};

type SlackEvent = {
  type: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
};

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-slack-signature");
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const v = verifySlackSignature({ rawBody, signature, timestamp });
  if (!v.ok) {
    return NextResponse.json(
      { error: "signature_invalid", reason: v.reason },
      { status: 401 },
    );
  }

  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // URL verification handshake — return the challenge unmodified.
  if (envelope.type === "url_verification" && envelope.challenge) {
    return new NextResponse(envelope.challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  // Acknowledge immediately so Slack doesn't retry — the actual
  // model call runs in `processEventAsync` after this response is
  // sent. Vercel keeps the function warm for the full maxDuration.
  if (envelope.type === "event_callback" && envelope.event) {
    // Fire-and-forget — we intentionally don't await here so the
    // ack returns within the 3-second Slack window.
    void processEventAsync(envelope.event);
  }

  return NextResponse.json({ ok: true });
}

async function processEventAsync(event: SlackEvent): Promise<void> {
  try {
    // Skip the bot's own messages — otherwise app_mention →
    // bot reply → message.channels event → loop.
    if (event.bot_id) return;
    if (event.subtype === "bot_message") return;
    const botId = await slackBotUserId();
    if (botId && event.user === botId) return;

    // We only care about messages with content in a channel.
    if (!event.channel || !event.text) return;
    if (event.type !== "app_mention" && event.type !== "message") return;

    // Strip a leading `<@BOTID>` mention so the agent sees just
    // the message body.
    let text = event.text;
    if (botId) {
      const mention = `<@${botId}>`;
      if (text.includes(mention)) {
        text = text.replace(mention, "").trim();
      }
    }
    if (!text) return;

    // Look up the agent by channel. RLS-bypassed via service-role
    // (lib/hiring is service-role) since this is a webhook with no
    // user session.
    const db = await hiring();
    const { data: agent } = await db
      .from("agents")
      .select("id, status, runtime, slack_channel_id")
      .eq("slack_channel_id", event.channel)
      .maybeSingle();
    if (!agent) return; // unrelated channel
    if (agent.status !== "active") return;
    if (agent.runtime !== "in_app") return;

    const result = await runAgent(agent.id as string, {
      message: text,
      source: "slack",
      slack: {
        channelId: event.channel,
        threadTs: event.thread_ts ?? event.ts ?? null,
        userId: event.user ?? null,
      },
    });

    const replyText =
      result.status === "ok"
        ? result.text ?? "(empty response)"
        : `:warning: ${result.error ?? "unknown error"}`;

    await slackPostMessage({
      channel: event.channel,
      text: replyText,
      // Reply in the same thread if the trigger was in a thread,
      // otherwise start a thread under the trigger message.
      thread_ts: event.thread_ts ?? event.ts ?? null,
    });
  } catch (err) {
    // Last-resort log — Slack won't see this since we already
    // ack'd; the failure is captured in agent_runs by runAgent's
    // own catch block.
    // eslint-disable-next-line no-console
    console.error("[slack-events] processEventAsync failed:", err);
  }
}
