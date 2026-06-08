// Resolves where to POST saves. Persisted in chrome.storage.local so
// the user can flip between prod / preview / localhost without
// rebuilding the extension. Defaults to production.

export const STORAGE_KEY_BACKEND = "talental.backendUrl";

export const DEFAULT_BACKEND_URL = "https://app.talental.mx";

export async function getBackendUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_BACKEND], (res) => {
      const val = res[STORAGE_KEY_BACKEND];
      resolve(
        typeof val === "string" && val.trim() ? val.replace(/\/+$/, "") : DEFAULT_BACKEND_URL,
      );
    });
  });
}

export async function setBackendUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { [STORAGE_KEY_BACKEND]: url.replace(/\/+$/, "") },
      () => resolve(),
    );
  });
}
