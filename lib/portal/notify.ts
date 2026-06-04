import "server-only";

/**
 * Fire-and-forget Slack webhook on a new portal comment / thumbs.
 * Opt-in via `SLACK_PORTAL_WEBHOOK_URL`. No-op if unset.
 *
 * Never throws — telemetry, not a critical path.
 */
export async function notifyPortalComment(args: {
  workspaceName: string;
  jobTitle: string;
  candidateName: string;
  email: string;
  body: string | null;
  sentiment: "up" | "down" | null;
  candidateUrl: string;
}): Promise<void> {
  const url = process.env.SLACK_PORTAL_WEBHOOK_URL;
  if (!url) return;
  const emoji =
    args.sentiment === "up" ? "👍" : args.sentiment === "down" ? "👎" : "💬";
  const text =
    `${emoji} *${args.email}* on *${args.candidateName}* — _${args.jobTitle}_ (${args.workspaceName})\n` +
    (args.body ? `> ${args.body.slice(0, 500)}\n` : "") +
    `<${args.candidateUrl}|Open candidate>`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // swallow
  }
}
