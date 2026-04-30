# Talental Client Portal

Custom client-facing portal for Talental. Each client gets an unguessable URL
(`/p/<slug>`) that shows the candidates currently in the pipeline for their
job, pulled from Manatal and cached in Supabase.

## Stack

- Next.js 16 (App Router) + TypeScript
- Supabase (Postgres) for portal links, candidate cache, and a sync log
- Tailwind v4 + minimal handwritten shadcn-style components + Radix DropdownMenu
- Manatal Open API v3 (read-only)
- Deployed on Vercel at `clients.talental.mx`

## Setup

1. `cp .env.local.example .env.local` and fill in:
   - Supabase URL + anon + service role keys (project: Talental Client Portal)
   - `MANATAL_API_TOKEN` (shared with Zapier flows — be mindful of rate limit)
   - `ADMIN_PASSWORD` (any strong password — also used as HMAC for the admin
     cookie, so rotating it logs everyone out)
   - `NEXT_PUBLIC_SITE_URL` (e.g. `https://clients.talental.mx`)
2. `npm install`
3. `npm run dev`
4. Visit `/admin/login`, sign in, create a portal link, copy the URL.

The Supabase schema (`portal_links`, `candidate_cache`, `sync_log`) is already
applied. To evolve it, run migrations via the Supabase MCP.

> ⚠️ **When you add a new table via the Supabase MCP** (vs. the Studio SQL
> editor), include explicit grants in the migration, otherwise server-side
> queries get `permission denied` even with the service role key:
>
> ```sql
> grant all privileges on table public.<new_table> to service_role;
> revoke all on table public.<new_table> from anon, authenticated;
> alter table public.<new_table> enable row level security;
> ```

## How the cache works

Per the brief, the portal never hits Manatal directly on a page load when the
cache is fresh.

- `candidate_cache` rows are keyed by `(manatal_job_id, manatal_match_id)`.
- When `/p/[slug]` loads, we look up the portal link, then read all rows for
  the job. If the oldest `last_synced_at` is more than 15 minutes old (or there
  are no rows), we trigger a refresh.
- Refresh fetches the matches list once, then enriches each match with a
  candidate detail call and a social-media call (4-way concurrent), respecting
  a token bucket rate limiter targeting ~60 req/min (shared with Zapier).
- Stale rows for the job are marked `is_active_match = false` before upsert,
  so candidates removed from the pipeline naturally drop out of the view.
- On refresh failure, we serve stale data rather than blank the page.
- The portal page (`/p/[slug]`) wraps the candidates list in a `<Suspense>`
  boundary. The shell + skeleton stream within ~1s; the candidates HTML
  streams in as soon as the refresh resolves. The empty state ("No candidates
  yet") only renders after the refresh **completes** with zero rows — never
  speculatively while loading.
- To verify the streaming behavior locally, set `DEBUG_CACHE_DELAY_MS=5000`
  in `.env.local`. Every cold-cache load will then wait 5s before fetching
  from Manatal; you should see the loader for ~5s before the candidates
  appear.

## How file downloads work

Manatal file URLs expire after a few hours, so we never cache them. When the
client clicks Resume or an attachment, the browser hits one of these proxy
routes, which fetches a fresh URL from Manatal and 302-redirects to it:

- `GET /api/files/resume/[candidateId]`
- `GET /api/files/attachment/[candidateId]/[attachmentId]`

The attachments dropdown lazy-loads the list via
`GET /api/candidates/[candidateId]/attachments` only when opened.

> Note: the attachment proxy route includes `candidateId` in the path (a small
> deviation from the original brief which had only `[attachmentId]`). Manatal's
> attachment endpoint is per-candidate, so the candidate id is needed to
> resolve the file URL.

## Adding a new portal link

1. Sign in at `/admin/login`.
2. Click **New portal link**.
3. Search by job name, pick the right Manatal job, set a client display name
   and (optionally) an expiry.
4. Copy the generated URL and send it to the client.

Slugs are 12-character lowercase alphanumeric (~71 bits), generated with
`nanoid`.

## Cache pre-warming via cron

To avoid clients ever paying a cold-load cost (~5–10s the first time a stale
portal is opened), `/api/cron/refresh-portals` sweeps every active portal
link and refreshes its candidate cache. Sequential refreshes, with a 15-min
TTL skip so it dedupes against on-demand refreshes (and against creation
auto-warms — see below) that already ran.

**Creation auto-warm:** when a new portal link is created via `/admin/new`,
the API route fires `refreshJobCache(...)` in the background (via Next's
`after()` API → `waitUntil` on Vercel). The admin sees the success page
instantly and the candidate cache is populated by the time the client opens
the URL. The advisory lock in `refreshJobCache` ensures this doesn't
double-fetch if cron just finished a sweep for the same job.

### Endpoint

```
GET /api/cron/refresh-portals
Authorization: Bearer ${CRON_SECRET}
```

Response shape:

```json
{
  "total_portals": 10,
  "refreshed": 7,
  "skipped": 3,
  "errors": 0,
  "duration_ms": 9876,
  "details": [
    { "job_id": 3821171, "slug": "iu1f...", "outcome": "refreshed" },
    { "job_id": 3826949, "slug": "sgdd...", "outcome": "skipped", "age_min": 4 },
    ...
  ]
}
```

Each portal also writes a `cron-refresh` row to `sync_log` (with the
`manatal_job_id`, status_code, duration_ms, and a human-readable message).
On error, status_code = 500 and the error message is in `error_message`,
prefixed with the job id.

### `CRON_SECRET`

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set it as `CRON_SECRET` in `.env.local` for dev, and in Vercel project env
for production. Manually trigger locally with:

```bash
curl -H "Authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/refresh-portals
```

### Scheduling on Vercel Hobby (current plan)

Vercel Hobby only runs cron jobs once a day. The `vercel.json` in this repo
configures a 30-min schedule, which Vercel will downgrade to daily on Hobby.
Until you upgrade to Pro, drive the cron from an **external scheduler**.

**Setup with [cron-job.org](https://cron-job.org):**

1. Create a free account at cron-job.org.
2. New cronjob:
   - **URL:** `https://clients.talental.mx/api/cron/refresh-portals`
   - **Schedule:** Every 15 minutes (`*/15 * * * *`)
   - **Request method:** GET
   - **Headers** → Add: `Authorization: Bearer <your CRON_SECRET>`
   - **Notifications:** turn on failure notifications so you know if it stops working
3. Save and enable.
4. Trigger manually once to confirm — the response should be 200 with a JSON
   summary, and `sync_log` should show one `cron-refresh` row per active
   portal.

### Migrating to Vercel Pro

Once on Pro, Vercel will start running the schedule in `vercel.json`
automatically (`*/15 * * * *`). At that point disable the cron-job.org
trigger to avoid duplicate sweeps. No code change required — Vercel cron
sends the same `Authorization: Bearer ${CRON_SECRET}` header, which the
endpoint already accepts.

### Expected wall time

For typical Talental load (≈10 active portals, ≈20 candidates each):

- ~610 Manatal requests per full sweep (1 matches list + 60 per-candidate × 10)
- Token bucket throttles to ~60 req/min sustained → **~10 minutes per full sweep**
- Comfortably fits within the **15-minute cron interval** with ~5 min of headroom.
- The 15-min TTL skip is identical to the cron interval. In practice this means
  every other sweep finds most portals just-barely-fresh and skips them — those
  sweeps return in ~1 second. Trade-off for ensuring cache age never exceeds
  ~30 min in the worst case (a portal at the *end* of one sweep is fresh through
  the next sweep, then refreshed in the one after).
- Comfortably fits within Vercel's 800-second function timeout (Pro).

If you ever scale past ~30 active portals (sweep > 15 min), drop the cron
interval back to 30 min, or split sweeps across multiple endpoints.

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Add the env vars from `.env.local.example`.
3. Add the custom domain `clients.talental.mx`.
4. Deploy.

## Things to verify with a real Manatal job (per the brief)

- `match.stage.name` returns the stage label you expect.
- LinkedIn URL is found in `social-media`; if not, in `custom_fields`.
- Job IDs returned by `/jobs/?search=` cover the jobs you want to share.

## Out of scope (V2+)

- Client-editable notes
- Two-way sync
- Stage name translation/simplification
- Auth beyond the admin password
- Email notifications
- Analytics
