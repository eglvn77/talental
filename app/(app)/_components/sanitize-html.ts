import sanitizeHtmlLib from "sanitize-html";

/**
 * Sanitize HTML produced by the rich-text editor to a strict allowlist.
 *
 * Uses the `sanitize-html` package (htmlparser2-based — bundles cleanly in
 * Vercel serverless functions). The previous `isomorphic-dompurify` pulled
 * in `jsdom` which fails to package for Vercel's runtime.
 */
export function sanitizeRichText(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  return sanitizeHtmlLib(trimmed, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "a",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      // Default Tiptap links are target=_blank — keep that + add rel=noopener.
      a: sanitizeHtmlLib.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
}
