import { getBackendUrl, setBackendUrl } from "../shared/config";
import { pingAuth } from "../shared/api";

/**
 * Popup is intentionally minimal — its job is just to confirm the
 * user is logged in to the ATS and give them a way to flip the
 * backend URL if they're testing a preview deploy. All actual
 * candidate saving happens via the in-page panel on LinkedIn.
 */

const statusEl = document.getElementById("status") as HTMLDivElement;
const openAtsEl = document.getElementById("open-ats") as HTMLAnchorElement;
const backendEl = document.getElementById("backend") as HTMLInputElement;

function setStatus(kind: "checking" | "ok" | "err", message: string) {
  statusEl.className = `status status-${kind}`;
  statusEl.textContent = message;
}

async function refreshAuthStatus() {
  setStatus("checking", "Verificando sesión…");
  const base = await getBackendUrl();
  openAtsEl.href = base;

  const res = await pingAuth();
  if (res.ok) {
    setStatus("ok", "Sesión activa ✓");
  } else {
    setStatus(
      "err",
      `Sin sesión. Inicia sesión en ${new URL(base).host}.`,
    );
  }
}

// Persist backend URL on edit (debounced) + re-check session.
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
  await refreshAuthStatus();
})();
