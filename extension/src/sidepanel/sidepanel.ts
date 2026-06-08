import { getBackendUrl } from "../shared/config";

/**
 * Chrome Side Panel script. Loaded by the panel's HTML on open.
 *
 * Job:
 *   1. Read the currently-active tab's URL.
 *   2. If it's a linkedin.com/in/<slug>, iframe the Talental slim
 *      view at /extension/candidate-view?url=<that url>.
 *   3. Otherwise, show a friendly "abre un perfil de LinkedIn"
 *      placeholder.
 *   4. Listen to chrome.tabs.onUpdated + onActivated and re-render
 *      whenever the user navigates between LinkedIn profiles.
 *
 * Auth flows through the iframe automatically: the extension has
 * host_permissions for app.talental.mx, so Supabase session cookies
 * travel with the iframe request as first-party.
 */

const root = document.getElementById("root") as HTMLDivElement;
const emptyMsg = document.getElementById("empty-msg") as HTMLParagraphElement;

let currentSrc: string | null = null;

const LINKEDIN_PROFILE_RE =
  /^https?:\/\/(?:[^/]+\.)?linkedin\.com\/in\/([^/?#]+)/i;

function renderEmpty(msg: string) {
  if (currentSrc === null && emptyMsg.textContent === msg) return;
  currentSrc = null;
  root.innerHTML = `
    <div class="empty">
      <strong>Talental</strong>
      <p id="empty-msg">${msg}</p>
    </div>
  `;
}

async function renderForUrl(url: string) {
  if (!LINKEDIN_PROFILE_RE.test(url)) {
    renderEmpty(
      "Abre un perfil de LinkedIn (linkedin.com/in/…) en esta pestaña y el panel cargará el candidato.",
    );
    return;
  }
  const base = await getBackendUrl();
  const src = `${base}/extension/candidate-view?url=${encodeURIComponent(url)}`;
  if (src === currentSrc) return; // Same URL, nothing to do
  currentSrc = src;
  // Replace root with an iframe. Using innerHTML to ensure a fresh
  // iframe element every time — reloading the existing one would
  // sometimes cache the previous src.
  root.innerHTML = `<iframe src="${src}" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
}

async function refreshFromActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  await renderForUrl(tab?.url ?? "");
}

// React to tab navigation within the same tab (SPA pushState fires
// onUpdated with status="complete" and a new URL).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.active) return;
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  await renderForUrl(tab.url ?? "");
});

// React to switching tabs (user clicks a different tab in the window).
chrome.tabs.onActivated.addListener(async () => {
  await refreshFromActiveTab();
});

// Initial render.
void refreshFromActiveTab();
