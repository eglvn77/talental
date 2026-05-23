import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { getRequestWorkspaceId, hiring } from "@/lib/hiring";
import { detectMime, extractText } from "@/lib/cv-parse/extract-text";
import { parseCvWithClaude } from "@/lib/cv-parse/claude";

/**
 * POST /api/candidates/parse-cv
 *
 * Multipart form-data endpoint that takes ONE PDF or DOCX file in the
 * `file` field, extracts text, runs it through Claude Opus to get
 * structured JSON, and returns the parsed object.
 *
 * Concurrency control lives on the client (the import UI caps to 3
 * in-flight requests). This endpoint stays simple: one file in, one
 * structured candidate out.
 *
 * Logs each parse into hiring.api_usage_log with
 *   operation_type = 'cv_parse'
 *   cost_usd_estimated = computed from input/output tokens
 *   credits_used = 0 (DfB2B credits don't apply to Anthropic)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve tenant context up front so we can log even if parsing fails.
  let workspaceId: string;
  try {
    workspaceId = await getRequestWorkspaceId();
  } catch {
    return NextResponse.json(
      { error: "No workspace in session" },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` },
      { status: 400 },
    );
  }

  const mime = detectMime(file.name, file.type);
  if (!mime) {
    return NextResponse.json(
      {
        error:
          "Tipo de archivo no soportado. Sube un PDF o DOCX (no imágenes escaneadas).",
      },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Extract plain text.
  let text: string;
  try {
    text = await extractText({ buffer, mime });
  } catch (e) {
    return NextResponse.json(
      {
        error: `No pude extraer texto del archivo: ${
          e instanceof Error ? e.message.slice(0, 200) : String(e)
        }`,
      },
      { status: 400 },
    );
  }
  if (text.length < 80) {
    // Almost certainly an image-only PDF or near-empty file.
    return NextResponse.json(
      {
        error:
          "El CV no contiene texto extraíble. Probablemente es un PDF escaneado (imagen) — vuelve a subirlo exportado a texto.",
      },
      { status: 400 },
    );
  }

  // Run Claude.
  const start = Date.now();
  try {
    const { parsed, usage } = await parseCvWithClaude(text);

    // Log to api_usage_log. Best-effort — a logging failure
    // shouldn't break the parse response.
    try {
      const db = await hiring();
      await db.from("api_usage_log").insert({
        workspace_id: workspaceId,
        operation_type: "cv_parse",
        resource_external_id: file.name.slice(0, 200),
        credits_used: 0,
        cost_usd_estimated: usage.cost_usd_estimated,
        cache_hit: false,
        api_response_status: 200,
        api_response_time_ms: Date.now() - start,
      });
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      file_name: file.name,
      bytes: file.size,
      parsed,
      usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Best-effort log of the failure so usage dashboard still shows it.
    try {
      const db = await hiring();
      await db.from("api_usage_log").insert({
        workspace_id: workspaceId,
        operation_type: "cv_parse",
        resource_external_id: file.name.slice(0, 200),
        credits_used: 0,
        cost_usd_estimated: 0,
        cache_hit: false,
        api_response_status: 0,
        api_response_time_ms: Date.now() - start,
      });
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: `Claude parse failed: ${msg.slice(0, 300)}` },
      { status: 500 },
    );
  }
}
