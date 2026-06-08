import { getBackendUrl, setBackendUrl } from "../shared/config";
import {
  checkProfile,
  getJobs,
  saveLink,
  pingAuth,
  type JobOption,
  type ScrapedProfile,
} from "../shared/api";

/**
 * The popup IS the extension's UI. State machine:
 *
 *   loading   → on open, while we check tab + auth + ATS
 *   no_tab    → no active tab / not LinkedIn /in/<slug>
 *   no_auth   → user not logged in to ATS
 *   exists    → candidate already in ATS — show name + open link
 *   not_found → "Todavía no está" + job picker + Agregar button
 *   saving    → after Agregar click
 *   saved     → success, show open link
 *   error     → message + retry
 */

const mainEl = document.getElementById("main") as HTMLElement;
const backendEl = document.getElementById("backend") as HTMLInputElement;

type State =
  | { phase: "loading" }
  | { phase: "no_tab"; reason: string }
  | { phase: "no_auth"; host: string }
  | {
      phase: "exists";
      candidateId: string;
      name: string | null;
      base: string;
    }
  | {
      phase: "not_found";
      url: string;
      jobs: JobOption[];
    }
  | { phase: "saving" }
  | {
      phase: "saved";
      candidateId: string;
      name: string;
      cacheHit: boolean;
      jobAttached: boolean;
      base: string;
    }
  | { phase: "error"; message: string };

let state: State = { phase: "loading" };
let selectedJobId: string | null = null;

// ── Render ───────────────────────────────────────────────────

function el(
  tag: string,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = [],
): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function render() {
  mainEl.innerHTML = "";
  const wrap = el("div", { class: `state state-${state.phase}` });

  switch (state.phase) {
    case "loading": {
      wrap.appendChild(el("div", { class: "spinner" }));
      wrap.appendChild(el("p", { class: "hint" }, ["Buscando en Talental…"]));
      break;
    }

    case "no_tab": {
      wrap.appendChild(
        el("p", { class: "hint" }, [
          "Abre un perfil de ",
          el(
            "a",
            { href: "https://www.linkedin.com", target: "_blank" },
            ["LinkedIn"],
          ),
          ` (linkedin.com/in/…) y vuelve a abrir la extensión.`,
        ]),
      );
      if (state.reason) {
        wrap.appendChild(el("p", { class: "hint muted" }, [state.reason]));
      }
      break;
    }

    case "no_auth": {
      wrap.appendChild(
        el("p", { class: "status status-err" }, [
          `Sin sesión. Inicia sesión en ${state.host}.`,
        ]),
      );
      const link = el("a", {
        class: "btn-primary",
        href: `https://${state.host}`,
        target: "_blank",
      }) as HTMLAnchorElement;
      link.textContent = `Abrir ${state.host} →`;
      wrap.appendChild(link);
      break;
    }

    case "exists": {
      wrap.appendChild(
        el("div", { class: "badge badge-ok" }, ["✓ En tu base"]),
      );
      wrap.appendChild(
        el("p", { class: "candidate-name" }, [state.name || "(sin nombre)"]),
      );
      const link = el("a", {
        class: "btn-primary",
        href: `${state.base}/candidates?candidate=${state.candidateId}`,
        target: "_blank",
      }) as HTMLAnchorElement;
      link.textContent = "Abrir en Talental →";
      wrap.appendChild(link);
      break;
    }

    case "not_found": {
      wrap.appendChild(
        el("div", { class: "badge badge-warn" }, ["Todavía no está"]),
      );
      wrap.appendChild(
        el("p", { class: "hint" }, [
          "Este perfil aún no está en tu base. Puedes agregarlo:",
        ]),
      );

      if (state.jobs.length > 0) {
        const labelEl = el("label", { for: "job-picker", class: "field-label" }, [
          "Asociar a una vacante (opcional)",
        ]);
        wrap.appendChild(labelEl);
        const select = el("select", {
          id: "job-picker",
          class: "select",
        }) as HTMLSelectElement;
        const noneOpt = el("option", { value: "" }, [
          "Sin vacante (talent pool)",
        ]) as HTMLOptionElement;
        select.appendChild(noneOpt);
        for (const j of state.jobs) {
          const opt = el("option", { value: j.id }, [
            j.company_name ? `${j.title} — ${j.company_name}` : j.title,
          ]) as HTMLOptionElement;
          select.appendChild(opt);
        }
        select.value = selectedJobId ?? "";
        select.addEventListener("change", () => {
          selectedJobId = select.value || null;
        });
        wrap.appendChild(select);
      }

      const btn = el("button", {
        type: "button",
        class: "btn-primary",
      }) as HTMLButtonElement;
      btn.textContent = "Agregar a Talental";
      btn.addEventListener("click", () => {
        void handleAdd(state.url);
      });
      wrap.appendChild(btn);
      break;
    }

    case "saving": {
      wrap.appendChild(el("div", { class: "spinner" }));
      wrap.appendChild(el("p", { class: "hint" }, ["Guardando…"]));
      break;
    }

    case "saved": {
      wrap.appendChild(
        el("div", { class: "badge badge-ok" }, [
          state.cacheHit ? "✓ Ya estaba en tu base" : "✓ Guardado",
        ]),
      );
      wrap.appendChild(el("p", { class: "candidate-name" }, [state.name]));
      if (state.jobAttached) {
        wrap.appendChild(
          el("p", { class: "hint muted" }, ["Vinculado a la vacante"]),
        );
      }
      const link = el("a", {
        class: "btn-primary",
        href: `${state.base}/candidates?candidate=${state.candidateId}`,
        target: "_blank",
      }) as HTMLAnchorElement;
      link.textContent = "Abrir en Talental →";
      wrap.appendChild(link);
      break;
    }

    case "error": {
      wrap.appendChild(el("p", { class: "status status-err" }, ["Error"]));
      wrap.appendChild(el("p", { class: "hint" }, [state.message]));
      const btn = el("button", {
        type: "button",
        class: "btn-primary",
      }) as HTMLButtonElement;
      btn.textContent = "Reintentar";
      btn.addEventListener("click", () => {
        void boot();
      });
      wrap.appendChild(btn);
      break;
    }
  }

  mainEl.appendChild(wrap);
}

// ── Scrape via programmatic injection ───────────────────────
//
// chrome.scripting.executeScript injects the function into the
// tab's main world AND returns its result. This works regardless
// of whether the content script is already loaded — Chrome wakes
// the page, runs the function, and reports back. No more "stale
// tab loaded before extension reload" failure mode.
//
// The function MUST be self-contained — it gets serialized and
// re-parsed in the page context. No imports, no outer closure
// variables. So we inline the whole scrape logic here even though
// shared/scrape.ts has the same code (used by the content script
// auto-load for newly opened tabs).

async function scrapeActiveTab(tabId: number): Promise<ScrapedProfile | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      func: scrapeProfileInPage as any,
    });
    return (result?.result as ScrapedProfile | null) ?? null;
  } catch (e) {
    console.warn("[talental] scrape failed:", e);
    return null;
  }
}

/**
 * Self-contained scraper that runs IN THE LINKEDIN PAGE via
 * chrome.scripting.executeScript. No imports, no outer references.
 * If it can't find a field, returns null for that field — the
 * backend handles partial data fine.
 */
function scrapeProfileInPage(): {
  full_name: string | null;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  about: string | null;
} | null {
  const clean = (raw: string | null | undefined, max = 500): string | null => {
    if (!raw) return null;
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return null;
    return t.length > max ? t.slice(0, max) + "…" : t;
  };

  // Only run on /in/ profile pages
  if (!/^\/in\/[^/]+/i.test(location.pathname)) return null;

  // Name — <h1> in <main>
  const h1 = document.querySelector("main h1, h1");
  const full_name = clean(h1?.textContent ?? null);

  // Headline — first .text-body-medium under main, skipping noise
  let headline: string | null = null;
  const headCandidates = document.querySelectorAll(
    "main .text-body-medium, main div.text-body-medium",
  );
  for (const elNode of Array.from(headCandidates).slice(0, 5)) {
    const el = elNode as HTMLElement;
    const txt = clean(el.textContent);
    if (!txt) continue;
    if (/open to|premium|sponsored/i.test(txt)) continue;
    if (txt.length > 4 && txt.length < 200) {
      headline = txt;
      break;
    }
  }

  // Experience — first item under #experience section
  let current_title: string | null = null;
  let current_company: string | null = null;
  const expAnchor = document.querySelector("#experience");
  const expSection = expAnchor?.closest("section") as HTMLElement | null;
  if (expSection) {
    const firstItem = expSection.querySelector("li");
    if (firstItem) {
      const spans = firstItem.querySelectorAll("span[aria-hidden='true']");
      const texts = Array.from(spans)
        .map((s) => clean((s as HTMLElement).textContent))
        .filter((s): s is string => !!s);
      current_title = texts[0] ?? null;
      for (const t of texts.slice(1, 5)) {
        if (
          /full-time|part-time|contract|self-employed|present|·/i.test(t)
        ) {
          const first = t.split(/\s*·\s*/)[0];
          if (first && first.length > 1) {
            current_company = clean(first);
            break;
          }
          continue;
        }
        current_company = t;
        break;
      }
    }
  }

  // Location
  let locationStr: string | null = null;
  const locCandidates = document.querySelectorAll(
    "main span.text-body-small",
  );
  for (const elNode of Array.from(locCandidates).slice(0, 10)) {
    const el = elNode as HTMLElement;
    const txt = clean(el.textContent);
    if (!txt) continue;
    if (
      /,/.test(txt) &&
      !/\bconnection|follower|mutual/i.test(txt) &&
      txt.length < 80
    ) {
      locationStr = txt;
      break;
    }
  }

  // About
  let about: string | null = null;
  const aboutSection = document.querySelector("#about")?.closest("section");
  if (aboutSection) {
    const span = aboutSection.querySelector("span[aria-hidden='true']");
    about = clean((span as HTMLElement | null)?.textContent ?? null, 2000);
  }

  return {
    full_name,
    headline,
    current_title,
    current_company,
    location: locationStr,
    about,
  };
}

// ── Flow ─────────────────────────────────────────────────────

async function handleAdd(url: string) {
  state = { phase: "saving" };
  render();

  // Scrape the active tab's DOM via chrome.scripting.executeScript
  // (works regardless of whether a content script is loaded).
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  let scraped: ScrapedProfile | null = null;
  if (tabId != null) {
    scraped = await scrapeActiveTab(tabId);
  }

  // Telemetry: log what fields the scrape recovered so the user can
  // verify in DevTools if something is off. Helps diagnose LinkedIn
  // DOM changes without needing to push code.
  console.info("[talental] scrape result:", scraped);

  const res = await saveLink(url, {
    scrapedData: scraped,
    jobId: selectedJobId,
  });
  if (!res.ok) {
    state = { phase: "error", message: res.error };
    render();
    return;
  }
  state = {
    phase: "saved",
    candidateId: res.id,
    name: res.name,
    cacheHit: res.cacheHit,
    jobAttached: Boolean(res.application_id),
    base: await getBackendUrl(),
  };
  render();
}

async function boot() {
  state = { phase: "loading" };
  render();

  // Step 1: active tab + URL check.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? "";
  const isLinkedinProfile = /https?:\/\/(?:[^/]+\.)?linkedin\.com\/in\/[^/?#]+/i.test(
    url,
  );
  if (!isLinkedinProfile) {
    state = { phase: "no_tab", reason: "" };
    render();
    return;
  }

  // Step 2: auth.
  const base = await getBackendUrl();
  const auth = await pingAuth();
  if (!auth.ok) {
    state = { phase: "no_auth", host: new URL(base).host };
    render();
    return;
  }

  // Step 3: does the profile exist in ATS?
  const check = await checkProfile(url);
  if (!check.ok) {
    state = { phase: "error", message: check.error };
    render();
    return;
  }
  if (check.exists) {
    state = {
      phase: "exists",
      candidateId: check.id,
      name: check.name,
      base,
    };
    render();
    return;
  }

  // Step 4: not found — fetch open jobs for the picker in parallel.
  const jr = await getJobs();
  const jobs = jr.ok ? jr.jobs : [];
  state = { phase: "not_found", url, jobs };
  selectedJobId = null;
  render();
}

// ── Advanced settings (URL del ATS) ─────────────────────────

let saveTimer: number | undefined;
backendEl.addEventListener("input", () => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await setBackendUrl(backendEl.value);
    void boot();
  }, 400);
});

// Boot
(async () => {
  backendEl.value = await getBackendUrl();
  await boot();
})();
