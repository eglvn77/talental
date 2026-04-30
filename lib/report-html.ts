import sanitizeHtml from "sanitize-html";

// Talental's automation pipeline writes rich HTML into the
// candidate.custom_fields.candidatereport field. We treat it as untrusted on
// principle and sanitize before rendering. Allowed tags are limited to the
// structural set the report actually uses: paragraphs, lists, headings,
// inline emphasis, links, line breaks. Inline styles, classes, scripts,
// iframes, and event handlers are stripped — the portal stylesheet wins.
export function sanitizeReportHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "strong",
      "b",
      "em",
      "i",
      "a",
      "blockquote",
      "code",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "title"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
    },
    // Drop any disallowed text content like <script>console.log(...)</script>
    disallowedTagsMode: "discard",
  });
}
