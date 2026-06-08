// MV3 service worker.
//
// Two jobs in v0.5+:
//   1. Seed default backend URL on install.
//   2. Configure the Chrome Side Panel to open when the user clicks
//      the extension icon. The panel itself (sidepanel/sidepanel.ts)
//      handles tab detection + iframing the slim Talental view.
//
// The old message-dispatcher (check/jobs/save/ping) is gone — the
// side panel iframes the Talental ATS directly, so first-party
// cookies flow naturally and we don't need to proxy fetches
// through this worker. Less code, fewer permissions.

import { DEFAULT_BACKEND_URL, STORAGE_KEY_BACKEND } from "../shared/config";

chrome.runtime.onInstalled.addListener(() => {
  // Default backend URL.
  chrome.storage.local.get([STORAGE_KEY_BACKEND], (res) => {
    if (!res[STORAGE_KEY_BACKEND]) {
      chrome.storage.local.set({ [STORAGE_KEY_BACKEND]: DEFAULT_BACKEND_URL });
    }
  });
});

// Click on the toolbar icon → open the side panel for the current
// window. `setPanelBehavior` only needs to be called once but
// re-setting on every worker wake is idempotent and survives
// upgrades.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => {
    console.error("[talental] sidePanel.setPanelBehavior failed:", e);
  });
