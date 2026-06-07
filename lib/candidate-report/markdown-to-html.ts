/**
 * Convert the markdown subset our candidate-report prompt emits
 * into HTML for storage + display in the Tiptap editor.
 *
 * Subset (kept tight so the workspace prompt's output shape is the
 * only contract we honor):
 *   ## heading         → <h2>…</h2>
 *   ### heading        → <h3>…</h3>
 *   * bullet (or `- `) → <li> grouped under <ul>
 *   1. ordered         → <li> grouped under <ol>
 *   **bold**           → <strong>
 *   *italic*           → <em>
 *   blank line         → paragraph break
 *
 * HTML in the input is escaped before formatting, so even if the
 * AI ever leaks raw HTML it stays as visible text rather than
 * executing. The output is what gets saved to
 * applications.candidate_report and what Tiptap loads.
 *
 * Detection helper: many existing rows still hold raw markdown
 * (pre-rich-text migration). isProbablyHtml() lets the UI decide
 * whether to pass the value through a converter on load.
 */

export function isProbablyHtml(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return /^<(p|h[1-6]|ul|ol|li|strong|em|div|span)\b/i.test(trimmed);
}

export function markdownToHtml(text: string): string {
  if (!text) return "";
  if (isProbablyHtml(text)) return text;

  const lines = text.split("\n");
  const out: string[] = [];
  let bulletList: string[] | null = null;
  let orderedList: string[] | null = null;
  let para: string[] | null = null;

  const flushBullets = () => {
    if (bulletList) {
      out.push(`<ul>${bulletList.map((li) => `<li>${inlineFormat(li)}</li>`).join("")}</ul>`);
      bulletList = null;
    }
  };
  const flushOrdered = () => {
    if (orderedList) {
      out.push(`<ol>${orderedList.map((li) => `<li>${inlineFormat(li)}</li>`).join("")}</ol>`);
      orderedList = null;
    }
  };
  const flushPara = () => {
    if (para && para.length > 0) {
      out.push(`<p>${para.map(inlineFormat).join("<br/>")}</p>`);
      para = null;
    }
  };
  const flushAll = () => {
    flushBullets();
    flushOrdered();
    flushPara();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("### ")) {
      flushAll();
      out.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      flushAll();
      out.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      flushAll();
      out.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
    } else if (/^\s*[*-]\s+/.test(line)) {
      flushOrdered();
      flushPara();
      (bulletList ??= []).push(line.replace(/^\s*[*-]\s+/, ""));
    } else if (/^\s*\d+\.\s+/.test(line)) {
      flushBullets();
      flushPara();
      (orderedList ??= []).push(line.replace(/^\s*\d+\.\s+/, ""));
    } else if (line.trim() === "") {
      flushAll();
    } else {
      flushBullets();
      flushOrdered();
      (para ??= []).push(line);
    }
  }
  flushAll();
  return out.join("");
}

function inlineFormat(text: string): string {
  // Escape HTML first so AI-leaked tags can't execute.
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // **bold** must run before *italic* so the bold pattern eats its
  // own asterisks. Non-greedy.
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // *italic* — only match singles not adjacent to another *.
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return html;
}
