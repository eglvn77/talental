import { saveLink } from "../shared/api";

// Content script injected on every linkedin.com page. Detects
// /in/<slug> (profile) or /company/<slug> (company) pages, injects
// a floating "Save to Talental" button in the corner, and POSTs the
// current URL to the ATS on click.
//
// We don't scrape page DOM — only the canonical URL is sent. The
// backend dispatches to getCandidate / getCompany which use DfB2B as
// the source of truth.

const BUTTON_ID = "talental-save-button";

type PageKind = "profile" | "company" | null;

function detectKind(pathname: string): PageKind {
  if (/^\/in\/[^/]+/i.test(pathname)) return "profile";
  if (/^\/company\/[^/]+/i.test(pathname)) return "company";
  return null;
}

function buildButton(kind: Exclude<PageKind, null>): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.id = BUTTON_ID;
  wrap.setAttribute(
    "style",
    [
      "position: fixed",
      "right: 20px",
      "bottom: 20px",
      "z-index: 2147483647", // top of the stacking context
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      "user-select: none",
    ].join("; "),
  );

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent =
    kind === "profile" ? "Guardar candidato" : "Guardar empresa";
  btn.setAttribute(
    "style",
    [
      "padding: 10px 16px",
      "background: #2d3520", // Talental ink olive
      "color: #f5f0e6", // bone
      "border: none",
      "border-radius: 999px",
      "font-size: 13px",
      "font-weight: 600",
      "letter-spacing: 0.01em",
      "box-shadow: 0 4px 12px rgba(0,0,0,0.18)",
      "cursor: pointer",
      "display: inline-flex",
      "align-items: center",
      "gap: 8px",
      "transition: transform 120ms ease, box-shadow 120ms ease",
    ].join("; "),
  );
  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "translateY(-1px)";
    btn.style.boxShadow = "0 6px 18px rgba(0,0,0,0.22)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "";
    btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.18)";
  });

  const dot = document.createElement("span");
  dot.setAttribute(
    "style",
    "width:6px;height:6px;border-radius:999px;background:#9aa07a;display:inline-block;",
  );
  btn.prepend(dot);

  btn.addEventListener("click", async () => {
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    const original = btn.textContent;
    btn.textContent = "Guardando…";
    const res = await saveLink(window.location.href);
    btn.dataset.busy = "";
    if (!res.ok) {
      btn.textContent = "❌ Error";
      btn.title = res.error;
      // Auto-revert so the recruiter can retry without reloading.
      setTimeout(() => {
        btn.textContent = original;
        btn.title = "";
      }, 3500);
      return;
    }
    btn.textContent = res.cacheHit ? "✓ Ya estaba" : "✓ Guardado";
    btn.title = `${res.name ?? ""} (${res.kind})`;
    setTimeout(() => {
      btn.textContent = original;
      btn.title = "";
    }, 2500);
  });

  wrap.appendChild(btn);
  return wrap;
}

function ensureButton() {
  const existing = document.getElementById(BUTTON_ID);
  const kind = detectKind(window.location.pathname);
  if (!kind) {
    existing?.remove();
    return;
  }
  // Re-mount if the kind label needs to change (e.g. user navigated
  // /in/X → /company/Y inside LinkedIn's SPA).
  if (existing) {
    const expectedText =
      kind === "profile" ? "Guardar candidato" : "Guardar empresa";
    const currentBtn = existing.querySelector("button");
    if (currentBtn?.textContent?.includes(expectedText)) return;
    existing.remove();
  }
  document.body.appendChild(buildButton(kind));
}

// Initial mount + react to LinkedIn's SPA navigations. LinkedIn uses
// history.pushState; there's no native event for that, so we patch.
ensureButton();

let lastHref = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    ensureButton();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("popstate", ensureButton);
