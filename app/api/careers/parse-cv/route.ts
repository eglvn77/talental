import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf/extract";
import { parseResumeText } from "@/lib/resume-parse";

/**
 * Public CV parsing endpoint for the careers apply flow.
 *
 * Candidate selects a PDF in the apply modal → client POSTs the
 * file here → we extract text + run the resume parser tool-use →
 * the modal autofills the form fields (name, email, phone,
 * location, linkedin) from the result.
 *
 * Anonymous: same threat model as /api/careers/apply, with a
 * stricter rate limit since each parse triggers a Claude call.
 * No persistence — the file is read, parsed, dropped.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 3;
const ipHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    ipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return false;
}

function ipFor(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip") ?? "unknown";
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  if (rateLimited(ipFor(req))) {
    return bad(
      "Demasiados intentos. Espera un minuto e intenta de nuevo.",
      429,
    );
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return bad("Cuerpo inválido");
  }
  const file = fd.get("cv");
  if (!(file instanceof File) || file.size === 0) {
    return bad("Adjunta un CV en PDF");
  }
  if (file.size > MAX_PDF_BYTES) {
    return bad("El CV no puede pesar más de 10 MB");
  }
  if (
    !file.type.includes("pdf") &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return bad("Solo PDF por ahora");
  }

  let text: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = await extractPdfText(bytes);
  } catch (e) {
    // Most common failure: scanned PDFs with no embedded text. Tell
    // the candidate plainly so they don't blame the form.
    return bad(
      e instanceof Error
        ? e.message
        : "No pudimos leer tu CV. Llena los campos manualmente.",
    );
  }

  try {
    const parsed = await parseResumeText(text);
    return NextResponse.json({
      ok: true,
      data: {
        full_name: parsed.full_name ?? null,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        location: parsed.location ?? null,
        linkedin_url: parsed.linkedin_url ?? null,
      },
    });
  } catch (e) {
    return bad(
      e instanceof Error
        ? `Error al procesar: ${e.message.slice(0, 200)}`
        : "Error al procesar el CV",
      500,
    );
  }
}
