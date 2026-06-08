# Talental — Chrome Extension

LinkedIn → ATS in one click. Detects whether the profile is already
in your workspace, adds it if not, optionally pre-attaches it to a
vacante, and auto-enriches with whatever data we can get.

## How it works

When you load any `linkedin.com/in/<slug>` page, the content script:

1. **GET `/api/extension/check`** with the canonical URL. The backend
   looks up the workspace's `hiring.candidates` table by `linkedin_url`.
2. **If exists** → small badge `✓ En tu base` + link to the internal
   candidate page (opens in a new tab).
3. **If not exists**:
   - Pre-fetches the workspace's open vacantes via `GET /api/extension/jobs`
     and shows a picker dropdown (optional — recruiter can save without
     attaching to a job).
   - On click **"Agregar a Talental"**:
     - Scrapes the visible DOM (name, headline, current title +
       company, location, about) — **zero LinkedIn API calls**, just
       reading what's already rendered.
     - **POST `/api/extension/save-link`** with the URL + scraped
       payload + selected job_id.
     - Backend uses the DOM-scraped data DIRECTLY (free, instant) to
       create the candidate. When `job_id` is set, also creates an
       application at the job's first pipeline stage.
     - Coresignal is NOT called on save — it stays available as a
       separate explicit "Enrich with AI" button inside the in-app
       candidate panel, in case the recruiter wants the richer
       experience/education/skills arrays Coresignal provides.

`/company/<slug>` pages also work — same flow, simpler payload (no
job picker).

The extension piggybacks on your existing Supabase session via cookies
— no separate token plumbing. You stay logged in as the user that's
already logged in to the ATS in another tab.

## Why this is ToS-safe

LinkedIn bans **automation** — bots that visit pages on your behalf,
scrape at scale, or simulate clicks. This extension does none of
that:

- The page is already loaded because **you** clicked into it
  manually. We don't navigate, request, or paginate anything from
  LinkedIn.
- DOM scraping fires only on your explicit "Add" click. No
  background polling, no automated visits.
- The actual enrichment runs server-side via **Coresignal** (a
  licensed LinkedIn data provider). LinkedIn never sees a single
  request from our infrastructure.

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
