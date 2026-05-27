import { NextResponse } from "next/server";
import { extractDocxText } from "@/lib/docx/extract";
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

/**
 * Country lookup keyed by substrings we expect to see in the
 * `location` field the parser returns (city + country string). The
 * value is the dial code (without the +) we'll prepend to a phone
 * that's missing one.
 *
 * Coverage is deliberately Latam-heavy + US/Spain, the markets
 * the careers site actually sees today. Anything we don't match
 * defaults to MX since Talental's primary market is Mexico —
 * better to guess right for the common case than to leave the
 * number bare. Recruiters can fix obvious wrong matches manually.
 */
const DIAL_CODES: Array<{ matchers: RegExp; dial: string }> = [
  { matchers: /\bmexico|méxico\b/i, dial: "52" },
  { matchers: /\bunited states|usa|u\.s\.a\.|america\b/i, dial: "1" },
  { matchers: /\bcanada\b/i, dial: "1" },
  { matchers: /\bspain|españa\b/i, dial: "34" },
  { matchers: /\bargentina\b/i, dial: "54" },
  { matchers: /\bcolombia\b/i, dial: "57" },
  { matchers: /\bchile\b/i, dial: "56" },
  { matchers: /\bperu|perú\b/i, dial: "51" },
  { matchers: /\buruguay\b/i, dial: "598" },
  { matchers: /\bbrasil|brazil\b/i, dial: "55" },
  { matchers: /\bguatemala\b/i, dial: "502" },
  { matchers: /\bcosta rica\b/i, dial: "506" },
  { matchers: /\bpanama|panamá\b/i, dial: "507" },
  { matchers: /\becuador\b/i, dial: "593" },
  { matchers: /\bvenezuela\b/i, dial: "58" },
];

function dialCodeFromLocation(location: string | null): string {
  if (location) {
    for (const { matchers, dial } of DIAL_CODES) {
      if (matchers.test(location)) return dial;
    }
  }
  // Default to Mexico — Talental's primary market.
  return "52";
}

/**
 * Add a country code to a phone number when one isn't already
 * present. The parser usually returns the digits as they appear in
 * the CV (e.g. "55 1234 5678") which renders OK locally but breaks
 * outbound messaging via WhatsApp / SMS providers that require
 * E.164. We don't try to be clever — just check for a leading `+`
 * or a 00-prefix; anything else gets the location's dial code.
 */
function normalizePhone(
  phone: string | null,
  location: string | null,
): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  // Already has a country code (E.164 or 00-prefixed) → return as-is.
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  // Strip every non-digit (parens, dashes, spaces) so the resulting
  // string is a clean concat: +<dial><digits>.
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  const dial = dialCodeFromLocation(location);
  // Avoid double-prefixing if the digits already start with the
  // dial code (e.g. CV had "521234..." without the +).
  if (digits.startsWith(dial)) return `+${digits}`;
  return `+${dial}${digits}`;
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
    return bad("Adjunta un CV en PDF o DOCX");
  }
  if (file.size > MAX_PDF_BYTES) {
    return bad("El CV no puede pesar más de 10 MB");
  }
  const name = file.name.toLowerCase();
  const isPdf = file.type.includes("pdf") || name.endsWith(".pdf");
  const isDocx =
    file.type.includes("officedocument.wordprocessing") ||
    name.endsWith(".docx");
  if (!isPdf && !isDocx) {
    return bad("Formato no soportado para autofill (usa PDF o DOCX).");
  }

  let text: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = isPdf ? await extractPdfText(bytes) : await extractDocxText(bytes);
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
    const location = parsed.location ?? null;
    return NextResponse.json({
      ok: true,
      data: {
        full_name: parsed.full_name ?? null,
        email: parsed.email ?? null,
        phone: normalizePhone(parsed.phone ?? null, location),
        location,
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
