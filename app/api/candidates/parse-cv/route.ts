import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { getRequestWorkspaceId, hiring } from "@/lib/hiring";
import { parseCvWithGemini } from "@/lib/cv-parser/parse";
import { CV_PARSER_MODEL } from "@/lib/cv-parser/gemini-client";

/**
 * POST /api/candidates/parse-cv
 *
 * Multipart form-data endpoint. Takes ONE PDF in the `file` field,
 * pipes it as inlineData directly to Gemini 2.5 Flash (multimodal —
 * no text-extraction step needed), and returns structured JSON.
 *
 * DOCX support is deferred to P2: reliable DOCX→PDF conversion on
 * Vercel needs either Puppeteer (heavy) or external service. PDFs
 * cover ~95% of real-world CVs today.
 *
 * Logs each parse into hiring.api_usage_log:
 *   operation_type = 'cv_parse_gemini'
 *   cost_usd_estimated = computed from Gemini usageMetadata tokens
 *   credits_used = 0 (Gemini is priced in USD, not in DfB2B credits)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB — covers richly-formatted CVs

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // PDF only in MVP. Recognise via MIME OR extension.
  const mime = file.type.toLowerCase();
  const ext = file.name.toLowerCase();
  const isPdf =
    mime === "application/pdf" ||
    (mime === "application/octet-stream" && ext.endsWith(".pdf")) ||
    (mime === "" && ext.endsWith(".pdf"));
  if (!isPdf) {
    if (ext.endsWith(".docx") || mime.includes("officedocument")) {
      return NextResponse.json(
        {
          error:
            "DOCX no soportado todavía. Conviértelo a PDF y vuelve a subirlo.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: "Tipo de archivo no soportado. Sube un PDF.",
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const start = Date.now();
  try {
    const { parsed, usage } = await parseCvWithGemini({ pdfBytes: buffer });

    // Best-effort log; a logging failure shouldn't break the parse
    // response.
    try {
      const db = await hiring();
      await db.from("api_usage_log").insert({
        workspace_id: workspaceId,
        operation_type: "cv_parse_gemini",
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
      model: CV_PARSER_MODEL,
      parsed,
      usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    try {
      const db = await hiring();
      await db.from("api_usage_log").insert({
        workspace_id: workspaceId,
        operation_type: "cv_parse_gemini",
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
      { error: `Gemini parse failed: ${msg.slice(0, 300)}` },
      { status: 500 },
    );
  }
}
