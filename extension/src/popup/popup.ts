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
    const raw = result?.result as
      | (ScrapedProfile & { _provenance?: Record<string, string> })
      | null;
    if (!raw) return null;
    // Log provenance so we can see in DevTools which strategy
    // (jsonld / og / dom) won for each field. Strip before sending
    // to the backend — it doesn't need it.
    console.info("[talental] provenance:", raw._provenance ?? {});
    const { _provenance, ...clean } = raw;
    void _provenance;
    return clean;
  } catch (e) {
    console.warn("[talental] scrape failed:", e);
    return null;
  }
}

/**
 * Self-contained scraper that runs IN THE LINKEDIN PAGE via
 * chrome.scripting.executeScript. No imports, no outer references.
 *
 * Strategy is layered, most-stable-first:
 *   1. JSON-LD (<script type="application/ld+json">) — LinkedIn
 *      embeds Person structured data for SEO. This won't change
 *      because Google/Bing rely on it. Most reliable source.
 *   2. OpenGraph meta tags — og:title, og:description, og:image.
 *      Also SEO infrastructure, stable.
 *   3. document.title — "Name | LinkedIn" or "(N) Name - … | LinkedIn"
 *   4. DOM selectors — last resort, brittle.
 *
 * Each field gets filled by the first strategy that finds it. The
 * "_provenance" field in the result tells us which source won for
 * each — useful for diagnosing when LinkedIn changes things.
 */
function scrapeProfileInPage(): {
  full_name: string | null;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  about: string | null;
  _provenance: Record<string, string>;
} | null {
  const clean = (raw: string | null | undefined, max = 500): string | null => {
    if (!raw) return null;
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return null;
    return t.length > max ? t.slice(0, max) + "…" : t;
  };

  if (!/^\/in\/[^/]+/i.test(location.pathname)) return null;

  // Output bins + provenance tracking
  const out: {
    full_name: string | null;
    headline: string | null;
    current_title: string | null;
    current_company: string | null;
    location: string | null;
    about: string | null;
  } = {
    full_name: null,
    headline: null,
    current_title: null,
    current_company: null,
    location: null,
    about: null,
  };
  const prov: Record<string, string> = {};
  const set = (k: keyof typeof out, val: string | null, src: string) => {
    if (out[k] || !val) return;
    out[k] = val;
    prov[k] = src;
  };

  // ── Strategy 1: JSON-LD ────────────────────────────────────
  // LinkedIn emits one or more <script type="application/ld+json">
  // blocks. The Person schema has name, jobTitle (= headline),
  // worksFor (current employer), address, description (about).
  const ldScripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  for (const script of Array.from(ldScripts)) {
    try {
      const data = JSON.parse(script.textContent || "{}");
      const items: unknown[] = Array.isArray(data["@graph"])
        ? data["@graph"]
        : [data];
      for (const itemRaw of items) {
        const item = itemRaw as Record<string, unknown>;
        const t = item["@type"];
        const isPerson =
          t === "Person" || (Array.isArray(t) && t.includes("Person"));
        if (!isPerson) continue;

        set("full_name", clean(item.name as string), "jsonld:name");

        const jt = item.jobTitle;
        const jobTitleStr = Array.isArray(jt)
          ? clean(jt[0] as string)
          : clean(jt as string);
        set("headline", jobTitleStr, "jsonld:jobTitle");
        set("current_title", jobTitleStr, "jsonld:jobTitle");

        const wf = item.worksFor;
        const wfFirst = Array.isArray(wf) ? wf[0] : wf;
        const wfObj = (wfFirst ?? {}) as Record<string, unknown>;
        set(
          "current_company",
          clean(wfObj.name as string),
          "jsonld:worksFor",
        );

        const addr = item.address;
        const addrFirst = Array.isArray(addr) ? addr[0] : addr;
        const addrObj = (addrFirst ?? {}) as Record<string, unknown>;
        const locality = clean(addrObj.addressLocality as string);
        const region = clean(addrObj.addressRegion as string);
        const country = clean(addrObj.addressCountry as string);
        const composed =
          [locality, region, country].filter(Boolean).join(", ") || null;
        set("location", composed, "jsonld:address");

        set(
          "about",
          clean(item.description as string, 2000),
          "jsonld:description",
        );
      }
    } catch {
      // Malformed JSON in one script doesn't break the others
    }
  }

  // ── Strategy 2: OpenGraph meta tags ────────────────────────
  const getMeta = (prop: string): string | null => {
    const el = document.querySelector(`meta[property="${prop}"]`);
    return clean(el?.getAttribute("content") ?? null);
  };

  if (!out.full_name) {
    const ogTitle = getMeta("og:title");
    if (ogTitle) {
      // "Name | LinkedIn" or "Name - Headline | LinkedIn"
      const stripped = ogTitle
        .replace(/\s*\|\s*LinkedIn$/i, "")
        .replace(/\s*-\s*Profile$/i, "")
        .trim();
      const namePart = stripped.split(" - ")[0]?.trim();
      set("full_name", clean(namePart) ?? null, "og:title");
    }
  }
  if (!out.about) {
    set("about", getMeta("og:description"), "og:description");
  }

  // ── Strategy 3: document.title fallback for name ───────────
  if (!out.full_name) {
    const t = document.title;
    // "(3) Name - Headline | LinkedIn" — strip notification count
    const cleaned = t
      .replace(/^\(\d+\)\s*/, "")
      .replace(/\s*\|\s*LinkedIn$/i, "")
      .trim();
    const namePart = cleaned.split(" - ")[0]?.trim();
    set("full_name", clean(namePart) ?? null, "document.title");
  }

  // ── Strategy 4: DOM selectors (last resort, brittle) ───────
  if (!out.full_name) {
    const h1 = document.querySelector("main h1, h1");
    set("full_name", clean(h1?.textContent ?? null), "dom:h1");
  }
  if (!out.headline) {
    const candidates = document.querySelectorAll(
      "main .text-body-medium, main div.text-body-medium",
    );
    for (const elNode of Array.from(candidates).slice(0, 5)) {
      const txt = clean((elNode as HTMLElement).textContent);
      if (!txt) continue;
      if (/open to|premium|sponsored/i.test(txt)) continue;
      if (txt.length > 4 && txt.length < 200) {
        set("headline", txt, "dom:text-body-medium");
        break;
      }
    }
  }
  if (!out.location) {
    const candidates = document.querySelectorAll("main span");
    for (const elNode of Array.from(candidates).slice(0, 30)) {
      const txt = clean((elNode as HTMLElement).textContent);
      if (!txt) continue;
      if (
        /,/.test(txt) &&
        !/\bconnection|follower|mutual|view\b/i.test(txt) &&
        txt.length < 80 &&
        txt.length > 4
      ) {
        set("location", txt, "dom:span-comma");
        break;
      }
    }
  }

  return { ...out, _provenance: prov };
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
