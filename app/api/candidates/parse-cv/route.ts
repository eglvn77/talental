import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { getRequestWorkspaceId, hiring } from "@/lib/hiring";
import { parseCvWithGemini, type CvParseInput } from "@/lib/cv-parser/parse";
import { CV_PARSER_MODEL } from "@/lib/cv-parser/gemini-client";
import { extractDocxText } from "@/lib/cv-parser/extract-docx";

/**
 * POST /api/candidates/parse-cv
 *
 * Multipart form-data endpoint. Takes ONE PDF or DOCX in the `file`
 * field.
 *
 *   PDF  → passed as inlineData (base64) to Gemini 2.5 Flash. Multi-
 *          modal layout-aware parsing.
 *   DOCX → text extracted with mammoth, sent as a text part. DOCX
 *          CVs are nearly always single-column flowing text so we
 *          don't lose meaningful structure going text-only.
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

  // Detect PDF vs DOCX from MIME or extension. Browsers sometimes
  // send application/octet-stream for both, so fall back to ext.
  const mime = file.type.toLowerCase();
  const ext = file.name.toLowerCase();
  const isPdf =
    mime === "application/pdf" ||
    ((mime === "application/octet-stream" || mime === "") &&
      ext.endsWith(".pdf"));
  const isDocx =
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    ((mime === "application/octet-stream" || mime === "") &&
      ext.endsWith(".docx"));
  if (!isPdf && !isDocx) {
    return NextResponse.json(
      { error: "Tipo de archivo no soportado. Sube un PDF o DOCX." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Build the Gemini input: PDF goes multimodal, DOCX gets extracted
  // to text first via mammoth.
  let parseInput: CvParseInput;
  if (isPdf) {
    parseInput = { kind: "pdf", bytes: buffer };
  } else {
    let text: string;
    try {
      text = await extractDocxText(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error: `No pude leer el DOCX: ${msg.slice(0, 200)}`,
        },
        { status: 400 },
      );
    }
    if (text.length < 80) {
      return NextResponse.json(
        {
          error:
            "El DOCX no contiene texto extraíble (¿imágenes incrustadas?). Vuelve a guardarlo o conviértelo a PDF.",
        },
        { status: 400 },
      );
    }
    parseInput = { kind: "text", text };
  }

  const start = Date.now();
  try {
    const { parsed, usage } = await parseCvWithGemini(parseInput);

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
