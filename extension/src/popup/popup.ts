import { getBackendUrl, setBackendUrl } from "../shared/config";
import { saveLink } from "../shared/api";

const statusEl = document.getElementById("status") as HTMLDivElement;
const saveEl = document.getElementById("save") as HTMLButtonElement;
const hintEl = document.getElementById("hint") as HTMLParagraphElement;
const backendEl = document.getElementById("backend") as HTMLInputElement;

function setStatus(kind: "checking" | "ok" | "err", message: string) {
  statusEl.className = `status status-${kind}`;
  statusEl.textContent = message;
}

async function refreshAuthStatus() {
  setStatus("checking", "Verificando sesión…");
  const base = await getBackendUrl();
  try {
    const r = await fetch(`${base}/api/extension/save-link`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "ping" }), // intentionally invalid; we only care about 401 vs not
    });
    if (r.status === 401) {
      setStatus(
        "err",
        `Sin sesión. Inicia sesión en ${new URL(base).host}.`,
      );
      saveEl.disabled = true;
      return;
    }
    // Any non-401 (including the expected 400 for the ping URL) means
    // the user IS authenticated.
    setStatus("ok", "Sesión activa.");
    saveEl.disabled = false;
  } catch (e) {
    setStatus(
      "err",
      `No se pudo conectar a ${base}: ${e instanceof Error ? e.message : String(e)}`,
    );
    saveEl.disabled = true;
  }
}

async function pingCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const url = tab?.url ?? "";
  if (!/^https?:\/\/(?:[^/]+\.)?linkedin\.com\//i.test(url)) {
    hintEl.textContent =
      "Abre una página de LinkedIn (/in/… o /company/…) y vuelve a pulsar.";
    saveEl.dataset.targetUrl = "";
    return;
  }
  if (!/\/in\/|\/company\//i.test(url)) {
    hintEl.textContent =
      "Esta página de LinkedIn no es un perfil ni una empresa. Abre /in/… o /company/….";
    saveEl.dataset.targetUrl = "";
    return;
  }
  hintEl.textContent = url.replace(/^https?:\/\//, "");
  saveEl.dataset.targetUrl = url;
}

saveEl.addEventListener("click", async () => {
  const url = saveEl.dataset.targetUrl ?? "";
  if (!url) return;
  saveEl.disabled = true;
  const original = saveEl.textContent;
  saveEl.textContent = "Guardando…";
  const res = await saveLink(url);
  saveEl.disabled = false;
  if (!res.ok) {
    saveEl.textContent = "Error";
    hintEl.textContent = res.error;
    setTimeout(() => {
      saveEl.textContent = original;
    }, 2500);
    return;
  }
  saveEl.textContent = res.cacheHit ? "✓ Ya estaba" : "✓ Guardado";
  hintEl.textContent = `${res.name ?? ""} (${res.kind})`;
  setTimeout(() => {
    saveEl.textContent = original;
  }, 2500);
});

// Persist backend URL on every edit (debounced).
let saveTimer: number | undefined;
backendEl.addEventListener("input", () => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await setBackendUrl(backendEl.value);
    refreshAuthStatus();
  }, 400);
});

// Boot
(async () => {
  backendEl.value = await getBackendUrl();
  await Promise.all([pingCurrentTab(), refreshAuthStatus()]);
})();
