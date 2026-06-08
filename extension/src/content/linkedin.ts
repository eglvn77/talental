import { checkProfile, getJobs, saveLink, type JobOption } from "../shared/api";
import { isLinkedinProfilePage, scrapeCurrentProfile } from "../shared/scrape";
import { getBackendUrl } from "../shared/config";

/**
 * Talental content script — injected on every linkedin.com page.
 *
 * Behaviour:
 *   - On /in/<slug>: query the ATS for "does this candidate exist?"
 *     - If yes → render a discreet "En tu base" badge with a link
 *       to the internal candidate page.
 *     - If no  → render a "Agregar a Talental" button + optional
 *       job dropdown. Clicking scrapes the visible DOM and POSTs
 *       to the backend.
 *   - On /company/<slug>: legacy save flow (unchanged from V1).
 *   - On other pages: nothing.
 *
 * SPA-friendly: re-detects on URL change via a MutationObserver +
 * popstate listener (LinkedIn uses history.pushState).
 *
 * No automated scraping. The DOM read happens only on an explicit
 * "Add" click — the user already loaded the page manually.
 */

const PANEL_ID = "talental-extension-panel";

type PageKind = "profile" | "company" | null;

function detectKind(pathname: string): PageKind {
  if (/^\/in\/[^/]+/i.test(pathname)) return "profile";
  if (/^\/company\/[^/]+/i.test(pathname)) return "company";
  return null;
}

// ── State container for one mount cycle ─────────────────────

type State =
  | { phase: "loading" }
  | {
      phase: "exists";
      kind: "candidate" | "company";
      candidateId: string;
      name: string | null;
    }
  | { phase: "not_found"; kind: "candidate" | "company"; jobs: JobOption[] }
  | { phase: "saving" }
  | {
      phase: "saved";
      kind: "candidate" | "company";
      candidateId: string;
      cacheHit: boolean;
      jobAttached: boolean;
    }
  | { phase: "error"; message: string };

let state: State = { phase: "loading" };
let selectedJobId: string | null = null;

// ── Render ─────────────────────────────────────────────────

function panelEl(): HTMLDivElement {
  let el = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.id = PANEL_ID;
  el.setAttribute(
    "style",
    [
      "position: fixed",
      "right: 20px",
      "bottom: 20px",
      "z-index: 2147483647",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      "user-select: none",
      "max-width: 320px",
    ].join("; "),
  );
  document.body.appendChild(el);
  return el;
}

const PANEL_CARD_STYLE = [
  "background: #fdfbf6",
  "color: #2d3520",
  "border: 1px solid #d4cebf",
  "border-radius: 12px",
  "padding: 12px 14px",
  "font-size: 13px",
  "line-height: 1.4",
  "box-shadow: 0 8px 24px rgba(45,53,32,0.18)",
].join("; ");

const BUTTON_PRIMARY_STYLE = [
  "padding: 8px 14px",
  "background: #2d3520",
  "color: #f5f0e6",
  "border: none",
  "border-radius: 999px",
  "font-size: 13px",
  "font-weight: 600",
  "cursor: pointer",
  "transition: opacity 120ms ease",
  "width: 100%",
].join("; ");

const BUTTON_LINK_STYLE = [
  "color: #2d3520",
  "text-decoration: underline",
  "font-weight: 600",
  "cursor: pointer",
].join("; ");

const SELECT_STYLE = [
  "width: 100%",
  "padding: 6px 8px",
  "border: 1px solid #d4cebf",
  "border-radius: 8px",
  "background: white",
  "font-size: 12px",
  "color: #2d3520",
  "margin-top: 8px",
].join("; ");

async function backendCandidateUrl(candidateId: string): Promise<string> {
  const base = await getBackendUrl();
  return `${base}/candidates?candidate=${candidateId}`;
}

async function render() {
  const root = panelEl();
  root.innerHTML = "";
  const card = document.createElement("div");
  card.setAttribute("style", PANEL_CARD_STYLE);

  switch (state.phase) {
    case "loading": {
      card.textContent = "Talental…";
      break;
    }
    case "exists": {
      const label = document.createElement("div");
      label.setAttribute(
        "style",
        "font-size: 11px; font-weight: 600; color: #6b6857; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;",
      );
      label.textContent = "✓ En tu base";
      card.appendChild(label);

      const name = document.createElement("div");
      name.setAttribute(
        "style",
        "font-size: 14px; font-weight: 600; margin-bottom: 8px;",
      );
      name.textContent = state.name || "(sin nombre)";
      card.appendChild(name);

      const link = document.createElement("a");
      link.href = await backendCandidateUrl(state.candidateId);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir en Talental →";
      link.setAttribute("style", BUTTON_LINK_STYLE + "; font-size: 12px;");
      card.appendChild(link);
      break;
    }
    case "not_found": {
      const label = document.createElement("div");
      label.setAttribute(
        "style",
        "font-size: 11px; font-weight: 600; color: #6b6857; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;",
      );
      label.textContent =
        state.kind === "candidate"
          ? "Nuevo candidato"
          : "Nueva empresa";
      card.appendChild(label);

      if (state.kind === "candidate" && state.jobs.length > 0) {
        const select = document.createElement("select");
        select.setAttribute("style", SELECT_STYLE);
        const noneOpt = document.createElement("option");
        noneOpt.value = "";
        noneOpt.textContent = "Sin vacante (talent pool)";
        select.appendChild(noneOpt);
        for (const j of state.jobs) {
          const opt = document.createElement("option");
          opt.value = j.id;
          opt.textContent = j.company_name
            ? `${j.title} — ${j.company_name}`
            : j.title;
          select.appendChild(opt);
        }
        select.value = selectedJobId ?? "";
        select.addEventListener("change", () => {
          selectedJobId = select.value || null;
        });
        card.appendChild(select);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent =
        state.kind === "candidate"
          ? "Agregar a Talental"
          : "Agregar empresa";
      btn.setAttribute("style", BUTTON_PRIMARY_STYLE + "; margin-top: 10px;");
      btn.addEventListener("click", () => {
        void handleSaveClick();
      });
      card.appendChild(btn);
      break;
    }
    case "saving": {
      card.textContent = "Guardando…";
      break;
    }
    case "saved": {
      const label = document.createElement("div");
      label.setAttribute(
        "style",
        "font-size: 11px; font-weight: 600; color: #2d3520; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;",
      );
      label.textContent = state.cacheHit ? "✓ Ya estaba" : "✓ Guardado";
      card.appendChild(label);

      if (state.kind === "candidate" && state.jobAttached) {
        const sub = document.createElement("div");
        sub.setAttribute(
          "style",
          "font-size: 11px; color: #6b6857; margin-bottom: 8px;",
        );
        sub.textContent = "Vinculado a la vacante";
        card.appendChild(sub);
      }

      const link = document.createElement("a");
      link.href = await backendCandidateUrl(state.candidateId);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir en Talental →";
      link.setAttribute("style", BUTTON_LINK_STYLE + "; font-size: 12px;");
      card.appendChild(link);
      break;
    }
    case "error": {
      const label = document.createElement("div");
      label.setAttribute(
        "style",
        "font-size: 11px; font-weight: 600; color: #aa2222; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;",
      );
      label.textContent = "Error";
      card.appendChild(label);

      const msg = document.createElement("div");
      msg.setAttribute(
        "style",
        "font-size: 12px; color: #2d3520; margin-bottom: 10px;",
      );
      msg.textContent = state.message;
      card.appendChild(msg);

      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Reintentar";
      retry.setAttribute("style", BUTTON_PRIMARY_STYLE);
      retry.addEventListener("click", () => {
        void boot();
      });
      card.appendChild(retry);
      break;
    }
  }

  root.appendChild(card);
}

// ── Flow ────────────────────────────────────────────────────

async function handleSaveClick() {
  state = { phase: "saving" };
  await render();

  const url = window.location.href;
  const scraped = isLinkedinProfilePage() ? scrapeCurrentProfile() : null;
  const res = await saveLink(url, {
    scrapedData: scraped,
    jobId: selectedJobId,
  });
  if (!res.ok) {
    state = { phase: "error", message: res.error };
    await render();
    return;
  }
  state = {
    phase: "saved",
    kind: res.kind,
    candidateId: res.id,
    cacheHit: res.cacheHit,
    jobAttached: Boolean(res.application_id),
  };
  await render();
}

async function boot() {
  const kind = detectKind(window.location.pathname);
  if (!kind) {
    document.getElementById(PANEL_ID)?.remove();
    return;
  }

  state = { phase: "loading" };
  await render();

  const url = window.location.href;
  const check = await checkProfile(url);
  if (!check.ok) {
    state = { phase: "error", message: check.error };
    await render();
    return;
  }

  if (check.exists) {
    state = {
      phase: "exists",
      kind: check.kind,
      candidateId: check.id,
      name: check.name,
    };
    await render();
    return;
  }

  // Doesn't exist. Pre-fetch jobs in parallel for the picker (only
  // for candidate pages; companies don't get attached to jobs).
  let jobs: JobOption[] = [];
  if (kind === "profile") {
    const jr = await getJobs();
    if (jr.ok) jobs = jr.jobs;
  }
  state = {
    phase: "not_found",
    kind: kind === "profile" ? "candidate" : "company",
    jobs,
  };
  selectedJobId = null;
  await render();
}

// ── SPA navigation watch ────────────────────────────────────

let lastHref = window.location.href;
void boot();

const observer = new MutationObserver(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    void boot();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("popstate", () => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    void boot();
  }
});
