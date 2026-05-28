// MV3 service worker. Intentionally minimal in the MVP — the heavy
// lifting happens in the content script (DOM injection + URL detect)
// and the popup (auth status + manual save). Wakes on extension
// install / update to seed defaults and respond to extension
// lifecycle events.

import { DEFAULT_BACKEND_URL, STORAGE_KEY_BACKEND } from "../shared/config";

chrome.runtime.onInstalled.addListener(() => {
  // Seed the default backend URL on first install so the popup
  // settings field shows something instead of being empty.
  chrome.storage.local.get([STORAGE_KEY_BACKEND], (res) => {
    if (!res[STORAGE_KEY_BACKEND]) {
      chrome.storage.local.set({ [STORAGE_KEY_BACKEND]: DEFAULT_BACKEND_URL });
    }
  });
});
