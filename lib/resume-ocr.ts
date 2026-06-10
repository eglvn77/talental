import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Vision-OCR fallback for scanned resume PDFs.
 *
 * pdf-parse only reads the embedded text layer — scanned/image PDFs
 * (very common for CVs exported from phone scanners) come back
 * empty. Claude reads the document visually, so we send the PDF as
 * a base64 document block and ask for a verbatim transcription.
 * The transcription then flows through the normal parseResumeText
 * pipeline like any text-layer CV.
 *
 * Haiku keeps the cost negligible (~fractions of a cent per CV) and
 * is plenty for transcription. Throws on API errors / unreadable
 * documents — callers treat it like any other extraction failure.
 */
export async function transcribePdfWithVision(
  bytes: Uint8Array,
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(bytes).toString("base64"),
            },
          },
          {
            type: "text",
            text: "Transcribe the full text content of this resume/CV verbatim, preserving section structure. Output only the transcribed text, no commentary.",
          },
        ],
      },
    ],
  });
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();
  if (text.length < 50) {
    throw new Error("Vision transcription returned no usable text");
  }
  return text;
}
