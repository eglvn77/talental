import "server-only";

/**
 * Extract plain text from a DOCX binary via mammoth. Mammoth's
 * `extractRawText` returns a stripped string without formatting —
 * which is exactly what the resume parser needs (it re-structures
 * the content via Claude anyway, no value in preserving Word
 * styles).
 *
 * Throws when the buffer isn't a valid DOCX or extracts to empty
 * text. Callers should catch and surface a friendly error so the
 * recruiter / candidate knows to upload something else.
 */
export async function extractDocxText(
  bytes: Buffer | Uint8Array,
): Promise<string> {
  const mammoth = await import("mammoth");
  const buf = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  const result = await mammoth.extractRawText({ buffer: buf });
  const text = (result.value ?? "").trim();
  if (!text) {
    throw new Error("No se encontró texto en el DOCX.");
  }
  return text;
}
