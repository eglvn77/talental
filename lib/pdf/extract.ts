import "server-only";

/**
 * Extract plain text from a PDF binary. Wraps the quirky `pdf-parse`
 * v1 import — the package's index.js runs a debug load that ENOENTs
 * on a bundled sample, so we reach into the inner module path.
 *
 * Throws when the PDF is unparseable or has no extractable text
 * (e.g. a scanned image without OCR). Callers should catch and
 * surface a friendly error.
 */
export async function extractPdfText(bytes: Buffer | Uint8Array): Promise<string> {
  type PdfParseFn = (
    data: Buffer,
  ) => Promise<{ text: string; numpages: number; info: unknown }>;
  // @ts-expect-error — no types for the inner path; we know the shape.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse: PdfParseFn =
    typeof mod === "function"
      ? (mod as PdfParseFn)
      : ((mod as { default: PdfParseFn }).default as PdfParseFn);

  const buf =
    bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  const result = await pdfParse(buf);
  const text = (result.text ?? "").trim();
  if (!text) {
    throw new Error(
      "No se encontró texto en el PDF (¿es una imagen escaneada sin OCR?)",
    );
  }
  return text;
}
