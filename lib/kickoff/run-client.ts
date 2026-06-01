import type { KickoffRunEvent } from "./run";
import type { KickoffMaterials, KickoffSetupAnswers } from "./types";

/**
 * Browser-side driver for the kickoff SSE endpoint. Shared by the
 * per-job Kickoff dialog and the intake-first create flow so both parse
 * the stream the exact same way. POSTs multipart when PDFs are attached
 * (the server extracts their text Node-side) and JSON otherwise; reads
 * the `data:`-framed SSE stream and forwards phase/token events to the
 * callbacks, resolving with the final outcome.
 */
export type KickoffRunResult =
  | { ok: true; conflicts: string[] }
  | { ok: false; error: string };

export async function streamKickoffRun(args: {
  jobId: string;
  materials: KickoffMaterials;
  setupAnswers: KickoffSetupAnswers;
  runKind: "kickoff" | "calibration";
  promptKey?: string | null;
  files?: File[];
  onPhase?: (phase: string | null, message: string) => void;
  onTokens?: (chars: number) => void;
}): Promise<KickoffRunResult> {
  const payload = {
    jobId: args.jobId,
    materials: args.materials,
    setupAnswers: args.setupAnswers,
    runKind: args.runKind,
    promptKey: args.promptKey ?? null,
  };

  let res: Response;
  try {
    if (args.files && args.files.length > 0) {
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      for (const f of args.files) fd.append("files", f);
      res = await fetch("/api/kickoff/run", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/kickoff/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!res.ok || !res.body) {
    return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent: KickoffRunEvent | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames separated by a blank line; each starts with `data:`.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        let event: KickoffRunEvent;
        try {
          event = JSON.parse(line.slice(5).trim()) as KickoffRunEvent;
        } catch {
          continue;
        }
        if (event.type === "phase") {
          args.onPhase?.(event.phase, event.message);
        } else if (event.type === "tokens") {
          args.onTokens?.(event.chars);
        } else if (event.type === "done" || event.type === "error") {
          finalEvent = event;
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!finalEvent) return { ok: false, error: "Connection closed" };
  if (finalEvent.type === "error") return { ok: false, error: finalEvent.error };
  return { ok: true, conflicts: finalEvent.conflicts };
}
