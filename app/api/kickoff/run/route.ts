import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { executeKickoffRun, type KickoffRunEvent } from "@/lib/kickoff/run";
import type {
  KickoffMaterials,
  KickoffRunKind,
  KickoffSetupAnswers,
} from "@/lib/kickoff/types";

/**
 * Server-Sent Events endpoint that drives the kickoff dialog.
 *
 * The dialog POSTs the setup + materials, this opens a stream, and
 * every phase transition (context / generating / validating /
 * persisting / side_effects / done | error) writes a `data: {json}\n\n`
 * line back. Token counts during the Claude call stream as
 * `{ type: "tokens", chars }` events.
 *
 * Streaming (vs the old action) gives honest progress feedback during
 * the 15-30s wait — without it the UI is a spinner with no signal.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  jobId: string;
  materials: KickoffMaterials;
  setupAnswers: KickoffSetupAnswers;
  runKind: KickoffRunKind;
};

function sseLine(event: KickoffRunEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body?.jobId || !body?.materials || !body?.setupAnswers || !body?.runKind) {
    return new Response("Missing fields", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: KickoffRunEvent) => {
        try {
          controller.enqueue(encoder.encode(sseLine(event)));
        } catch {
          // Client disconnected; nothing to do — the run continues
          // server-side and the audit row in kickoff_runs is the
          // source of truth.
        }
      };
      try {
        await executeKickoffRun(body, emit);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        emit({ type: "error", error: msg.slice(0, 300) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Prevent Cloudflare / proxies from buffering the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
