# Talental — Chrome Extension

Save LinkedIn profiles + companies straight into your Talental ATS
with a one-click "Guardar" button injected on the page.

## How it works

1. Content script detects when you're on `linkedin.com/in/<slug>` or
   `linkedin.com/company/<slug>` and injects a floating
   **"Guardar candidato"** / **"Guardar empresa"** button in the
   bottom-right of the page.
2. Click → the extension POSTs the canonical LinkedIn URL to
   `<backend>/api/extension/save-link`.
3. The backend dispatches to the existing `getCandidate` /
   `getCompany` wrappers (cache-first → DataForB2B), so the same
   dedup + enrichment path the in-app flows use is honored. If the
   row already exists, no DfB2B credits are spent.

The extension piggybacks on your existing Supabase session via cookies
— no separate token plumbing. You stay logged in as the user that's
already logged in to the ATS in another tab.

## Local development

```bash
cd extension
npm install
npm run dev
```

Then in Chrome:

1. Open `chrome://extensions/`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** → select the `extension/dist/` directory.
4. Pin the extension to your toolbar for easy access.

For a production-style build:

```bash
npm run build
# load extension/dist/ unpacked
```

## Backend URL

The extension defaults to `https://app.talental.mx`. You can switch to
the testing preview (`https://ats-git-testing-emanuel-1027s-projects.vercel.app`)
or `http://localhost:3000` from the popup's **URL del ATS** field —
changes persist via `chrome.storage.local`.

## Why no scraping?

We tried it. It's brittle (LinkedIn changes their DOM every few weeks),
it eats maintenance time, and it's against LinkedIn's ToS. The "send
URL only, enrich via DfB2B" path is cleaner: no scraping, no fragile
selectors, single source of truth.
