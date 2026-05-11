import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
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
];
const ALLOWED_ATTR = ["href", "target", "rel"];

/**
 * Sanitize HTML produced by the rich-text editor to a strict allowlist:
 * paragraphs, line breaks, bold, italic, h1-h3, lists, and links.
 * Anything else (scripts, iframes, images, tables, on* attributes, etc.)
 * is stripped. Safe to render with dangerouslySetInnerHTML.
 */
export function sanitizeRichText(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  return DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
