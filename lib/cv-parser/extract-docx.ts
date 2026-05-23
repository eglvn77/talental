import "server-only";

/**
 * Pull plain text out of a DOCX buffer using mammoth.
 *
 * DOCX path can't go straight to Gemini multimodal (Gemini accepts
 * PDFs natively but not Word docs). The trade-off is fine: DOCX CVs
 * are almost always single-column flowing text, so we don't lose
 * meaningful structure by going text-only. Tables / column layouts
 * are rare in Word resumes; when they appear, the text still
 * extracts in reading order.
 *
 * Length cap: 25k chars (same as the original PDF text path). Bigger
 * CVs are noise.
 */

const MAX_TEXT_CHARS = 25_000;

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  let text = (result.value ?? "").trim();
  text = text.replace(/[ \t]+\n/g, "\n");
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
  }
  return text;
}
