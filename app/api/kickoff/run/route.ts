import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { executeKickoffRun, type KickoffRunEvent } from "@/lib/kickoff/run";
import { extractPdfText } from "@/lib/pdf/extract";
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

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PDF_COUNT = 3;

/**
 * Parse the request body. Supports two shapes:
 *   JSON      — old path, no files.
 *   Multipart — new path. `payload` field carries the JSON, plus
 *               up to MAX_PDF_COUNT PDF attachments under `files`.
 *               Each PDF gets text-extracted and appended to the
 *               materials' primary field (intake_transcript for
 *               kickoff, calibration_context for calibration) with
 *               a small header so the model can tell where each
 *               document starts.
 */
async function readRequestBody(req: NextRequest): Promise<
  | { ok: true; body: RequestBody }
  | { ok: false; status: number; message: string }
> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    let fd: FormData;
    try {
      fd = await req.formData();
    } catch {
      return { ok: false, status: 400, message: "Multipart inválido" };
    }
    const payloadRaw = fd.get("payload");
    if (typeof payloadRaw !== "string") {
      return { ok: false, status: 400, message: "Falta payload JSON" };
    }
    let body: RequestBody;
    try {
      body = JSON.parse(payloadRaw) as RequestBody;
    } catch {
      return { ok: false, status: 400, message: "Payload no es JSON válido" };
    }
    if (!body?.jobId || !body?.materials || !body?.setupAnswers || !body?.runKind) {
      return { ok: false, status: 400, message: "Faltan campos" };
    }

    const files = fd.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length > MAX_PDF_COUNT) {
      return {
        ok: false,
        status: 400,
        message: `Máximo ${MAX_PDF_COUNT} archivos.`,
      };
    }
    const extractedChunks: string[] = [];
    for (const file of files) {
      if (file.size === 0) continue;
      if (file.size > MAX_PDF_BYTES) {
        return {
          ok: false,
          status: 400,
          message: `"${file.name}" excede 10 MB.`,
        };
      }
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        return {
          ok: false,
          status: 400,
          message: `Solo PDFs por ahora ("${file.name}")`,
        };
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const text = await extractPdfText(bytes);
        extractedChunks.push(
          `\n\n--- DOCUMENTO: ${file.name} ---\n${text}\n--- FIN DEL DOCUMENTO ---\n`,
        );
      } catch (e) {
        return {
          ok: false,
          status: 400,
          message: `No se pudo leer "${file.name}": ${
            e instanceof Error ? e.message : "error desconocido"
          }`,
        };
      }
    }

    if (extractedChunks.length > 0) {
      const extra = extractedChunks.join("");
      const m = body.materials;
      if (body.runKind === "calibration") {
        const cur = m.calibration_context ?? "";
        m.intake_transcript = (m.intake_transcript ?? "") + extra;
        m.calibration_context = cur + extra;
      } else {
        m.intake_transcript = (m.intake_transcript ?? "") + extra;
      }
    }
    return { ok: true, body };
  }

  // JSON path (no files attached).
  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.jobId || !body?.materials || !body?.setupAnswers || !body?.runKind) {
      return { ok: false, status: 400, message: "Faltan campos" };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON" };
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const parsed = await readRequestBody(req);
  if (!parsed.ok) {
    return new Response(parsed.message, { status: parsed.status });
  }
  const body = parsed.body;

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
