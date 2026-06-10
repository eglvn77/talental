import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Vision-OCR fallback for scanned resume PDFs.
 *
 * pdf-parse only reads the embedded text layer — scanned/image PDFs
 * (very common for CVs exported from phone scanners) come back
 * empty. Gemini reads the document visually, so we send the PDF
 * inline and ask for a verbatim transcription. The transcription
 * then flows through the normal parseResumeText pipeline like any
 * text-layer CV.
 *
 * Gemini Flash per user preference (the CV-parser pipeline already
 * runs on it — one provider for everything CV-shaped, negligible
 * cost). Throws on API errors / unreadable documents — callers
 * treat it like any other extraction failure.
 */
const OCR_MODEL = "gemini-2.5-flash" as const;

export async function transcribePdfWithVision(
  bytes: Uint8Array,
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({
    model: OCR_MODEL,
    generationConfig: { temperature: 0 },
  });
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: Buffer.from(bytes).toString("base64"),
      },
    },
    {
      text: "Transcribe the full text content of this resume/CV verbatim, preserving section structure. Output only the transcribed text, no commentary.",
    },
  ]);
  const text = result.response.text().trim();
  if (text.length < 50) {
    throw new Error("Vision transcription returned no usable text");
  }
  return text;
}
