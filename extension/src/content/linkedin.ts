import { scrapeCurrentProfile, isLinkedinProfilePage } from "../shared/scrape";

/**
 * Content script — silent. No UI on the LinkedIn page; the popup is
 * the only surface. This script only exists to expose one capability
 * the popup can't do from its own context: read the LinkedIn DOM.
 *
 * The popup sends `{ kind: "scrape_profile" }` via
 * chrome.tabs.sendMessage(activeTabId, ...) and we reply with the
 * scraped fields.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind !== "scrape_profile") return false;
  if (!isLinkedinProfilePage()) {
    sendResponse({ ok: false, error: "No es un perfil de LinkedIn." });
    return false;
  }
  sendResponse({ ok: true, data: scrapeCurrentProfile() });
  return false;
});
