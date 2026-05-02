# Project handoff — Talental Client Portal

> Paste this whole doc into the start of a new Claude Code session before
> resuming work. It captures everything a fresh session would otherwise
> have to rediscover.

Last updated: 2026-05-02, v1 final — counters, JD tab, notes, kanban, soft-disable, prev/next nav, v1.0.0 tagged.

---

## 1. Product summary

A client-facing candidate review portal that replaces Manatal's native
client view. Each Talental client gets an unguessable URL
(`/p/<slug>`) that lists the candidates currently in pipeline for one
job, plus a deep page (`/p/<slug>/c/<candidateSlug>`) per candidate with
report + resume preview.

- **User**: Emanuel (founder of Talental, MX-based tech recruiting firm)
- **Stack**: Next.js 16 App Router · TypeScript · Tailwind v4 · Supabase
  Postgres · Vercel · Manatal Open API v3 (read-only)
- **Domain (target)**: `clients.talental.mx` (not yet deployed)
- **Today's status**: built end-to-end on local dev. Both the cron sweep
  and the create-portal auto-warm are verified. Ready to push to GitHub
  and deploy to Vercel Hobby.

The product spec evolved a lot during the build. The current canonical
behavior (which differs from earlier internal designs) is everywhere
in this doc.

---

## 2. Codebase tour

```
/app
  layout.tsx                       # Inter font, brand color set
  page.tsx                         # tiny landing pointer
  globals.css                      # Tailwind v4, --color-brand: #1565E0
  /admin
    /login                         # password gate, separate from protected layout
      page.tsx
    /(protected)                   # route group; layout enforces isAdmin()
      layout.tsx                   # chrome + auth check
      page.tsx                     # portal-links list with Last Refreshed + Refresh button
      /new
        page.tsx                   # job picker + form, surfaces Manatal errors inline
      copy-button.tsx              # icon-only Copy button (28px, lucide Copy/Check)
      portal-actions.ts            # server action: refreshPortalAction (lock-aware)
      refresh-button.tsx           # client component "Refresh now" + relative time
  /p
    /[slug]
      page.tsx                     # public portal page w/ Suspense streaming
      /_components
        candidates-list.tsx        # server component, table + mobile cards
        candidates-loading.tsx     # skeleton matching candidates-list shape
      /c/[candidateSlug]
        page.tsx                   # candidate detail: 2-col layout (report | PDF)
  /api
    /admin
      /login/route.ts              # POST password → sets HMAC cookie
      /logout/route.ts             # POST clears cookie
      /jobs/route.ts               # GET fetches all jobs + orgs, joins, returns
      /portal-links/route.ts       # POST creates portal + auto-warms via after()
    /candidates/[candidateId]/attachments/route.ts   # lazy attachment list
    /files
      /resume/[candidateId]/route.ts     # streams PDF inline (Content-Disposition: inline)
      /attachment/[candidateId]/[attachmentId]/route.ts  # 302 redirect to fresh URL
    /cron/refresh-portals/route.ts # sequential sweep, lock-aware, TTL skip

/components
  candidate-row.tsx                # one row, dual mode: <tr> for desktop, card for mobile
  empty-state.tsx
  files-dropdown.tsx               # combined Resume + lazy attachments
  portal-header.tsx                # Talental logo + client/job context
  report-body.tsx                  # sanitized HTML rendered with Talental typography
  report-modal-button.tsx          # icon trigger + Dialog with the report
  stage-badge.tsx                  # name → color (gray/sky/violet/amber/emerald/rose)
  /icons
    linkedin-icon.tsx              # inline SVG (lucide doesn't ship one)
  /ui                              # handwritten shadcn-style primitives
    badge.tsx · button.tsx · card.tsx · dialog.tsx · dropdown-menu.tsx
    input.tsx · skeleton.tsx

/lib
  auth.ts                          # admin password + HMAC cookie session
  cache.ts                         # SOURCE OF TRUTH for refresh logic
  manatal.ts                       # API client + token bucket + extractors
  report-html.ts                   # sanitize-html allowlist
  supabase.ts                      # service-role client + Row types
  utils.ts                         # cn(...)

/scripts                           # diagnostic only — not part of runtime (in .vercelignore)
  test-supabase.mjs                # service-role read + anon default-deny check
  probe-manatal-auth.mjs           # auth header scheme probes
  probe-manatal-jobs.mjs           # /jobs/ shape + filter behavior
  probe-manatal-linkedin.mjs       # /social-media/ shape exploration
  probe-manatal-resume.mjs         # /resume/ status across many candidates
  probe-manatal-resume-shape.mjs   # alternative URL shapes for resume
  probe-manatal-attachments.mjs    # attachment endpoint shape
  probe-manatal-experiences-educations.mjs
  probe-manatal-prefix.mjs         # token format detection
  probe-manatal-report-key.mjs     # custom_fields exploration for the report key
  probe-cand-147566811.mjs         # full sub-resource walk for one candidate
  probe-sgd-everyone.mjs           # walk every match in a job
  probe-isabel-report.mjs / probe-isabel-search.mjs
  fix-isabel.mjs                   # fetch-with-retry single-candidate seed
  seed-isabel.mjs                  # full direct DB upsert from probe data

/public
  talental-logo.svg                # actual Talental wordmark (replaced the placeholder)

vercel.json                        # cron schedule */15 * * * * (Pro-only; Hobby ignores)
.env.local.example                 # all env vars documented
.vercelignore                      # excludes scripts/ from Vercel uploads
README.md                          # ops doc (cron setup, env, deploy)
```

---

## 3. Database — Supabase project `ogjwwxfnjoznjwavccwn`

Org: `iegqljxnjizohvtovfjo` ("Talental"). 3 projects in this org; this
portal uses **Talental Client Portal** (`ogjwwxfnjoznjwavccwn`).

### Tables (all in `public`, RLS enabled, anon default-denied)

#### `portal_links`
One row per shared client URL.
- `id uuid pk` · `slug text unique` · `manatal_job_id integer`
- `manatal_job_position_name text` · `manatal_organization_name text`
- `client_display_name text` · `is_active boolean default true`
- `expires_at timestamptz` · `created_at timestamptz`
- `last_viewed_at timestamptz`
- `job_description text` (raw HTML from `job.description`; refreshed on every
  cache refresh, sanitized at render time on the JD tab)

#### `candidate_cache`
Cached pipeline state per `(manatal_job_id, manatal_match_id)`. Unique
index on that pair plus a unique index on `(manatal_job_id, candidate_slug)`.
- `id uuid pk` · `manatal_job_id` · `manatal_match_id` · `manatal_candidate_id`
- `candidate_slug text not null` (12-char lowercase alphanumeric, **stable forever** — see slug stability below)
- `candidate_full_name text` · `stage_name text` · `stage_rank integer`
  (from `match.job_pipeline_stage.rank`; higher = more advanced)
- `linkedin_url text` · `has_resume boolean` · `attachment_count int`
- `email text` · `current_company text` · `current_position text` · `description text`
- `candidate_report_html text` (raw HTML from `candidate.custom_fields.candidatereport`)
- `is_active_match boolean` — derived flag for "show in pipeline view";
  set to `match.is_active !== false && !match.dropped_at` on every refresh.
- `match_is_active boolean default true` — raw Manatal flag (preserved for
  audit / filtering separately from `is_active_match`).
- `submitted_at timestamptz` — Manatal's `match.submitted_at`. Powers the
  Submitted counter and is null-tested for "In Process".
- `dropped_at timestamptz` — Manatal's `match.dropped_at`. Powers the
  Rejected counter.
- `location text` · `current_comp_amount numeric` ·
  `current_comp_currency text` · `current_comp_frequency text`
- `raw_match_json jsonb` · `raw_candidate_json jsonb`
- `raw_experiences_json` · `raw_educations_json` · `raw_attachments_json` (currently UNUSED — added during a deferred deep-link iteration; kept to avoid migration churn, populated only sporadically)
- `last_synced_at timestamptz`

Index: `candidate_cache_stage_rank_idx on (manatal_job_id, stage_rank desc nulls last)` · `candidate_cache_job_slug_idx on (manatal_job_id, candidate_slug)` · `candidate_cache_job_idx on (manatal_job_id)`

#### `sync_log`
Audit log for every Manatal call AND every cron decision.
- `id uuid pk` · `manatal_job_id integer` (nullable for non-job calls)
- `endpoint text` (URL path, OR special markers like `cron-refresh`, `candidate-resume-detect`)
- `status_code integer` · `duration_ms integer` · `error_message text`
- `created_at timestamptz`

#### `candidate_notes`
Client-submitted notes on candidates, scoped to a portal.
- `id uuid pk default gen_random_uuid()`
- `candidate_cache_id uuid not null` → `candidate_cache(id)` on delete cascade
- `portal_link_id uuid not null` → `portal_links(id)` on delete cascade
- `author_name text not null` (length-checked > 0)
- `note_text text not null` (length-checked > 0)
- `created_at timestamptz default now()`
- Indexes: `(candidate_cache_id, created_at desc)` and `(portal_link_id, created_at desc)`
- RLS enabled, anon revoked, service_role full access. Public access is
  mediated only via the API routes in `/api/portal/.../notes/`.

#### `refresh_locks`
Cross-process advisory lock per job.
- `manatal_job_id integer pk` · `acquired_at timestamptz` · `expires_at timestamptz`

Two RPCs back the lock:
- `try_acquire_refresh_lock(p_job_id integer, p_lease_ms integer) returns timestamptz`
  — INSERT or UPDATE-where-expired; returns the acquired_at on success, NULL on contention.
- `release_refresh_lock(p_job_id integer, p_acquired_at timestamptz) returns boolean`
  — DELETE where the timestamp matches (so we only release OUR lock).

### Schema gotcha — **MUST READ for new tables**

Tables created via the Supabase MCP `apply_migration` do NOT auto-grant
to `service_role`. Server queries fail with Postgres 42501 "permission
denied for table" until grants are added. Every new-table migration
should include:

```sql
grant all privileges on table public.<new_table> to service_role;
revoke all on table public.<new_table> from anon, authenticated;
alter table public.<new_table> enable row level security;
```

This is documented in [the project memory file](/Users/eman/.claude/projects/-Users-eman-Projects-talental-clients-portal/memory/feedback_supabase_mcp_grants.md) too.

---

## 4. Refresh / cache architecture

**Single source of truth: `lib/cache.ts`.** Every refresh path goes
through `tryRefreshJobCache(jobId)`, which:

1. Calls `try_acquire_refresh_lock(jobId, 5min lease)` RPC.
2. If null returned → another worker is refreshing → returns the literal
   string `"contended"`.
3. Otherwise → calls private `refreshJobCache(jobId)` (does the actual
   work) and releases the lock in a `finally`.

Callers:
- **On-demand** (`getCandidatesForJob` from `/p/[slug]`): if contended,
  serves stale rows; if cold + contended, polls `waitForCachePopulated`
  for up to 30s.
- **Cron** (`/api/cron/refresh-portals`): if contended, increments
  `skipped` and writes `"skipped (contended)"` to `sync_log`.
- **Auto-warm** (after portal creation): no-op on contention.
- **Manual "Refresh now"** (admin): on contention, returns the current
  freshest timestamp without firing.

### `refreshJobCache` (the actual work)

1. Fetch all existing slugs for `(job_id, *)` to preserve them on update.
2. List job matches via `GET /jobs/{id}/matches/?page_size=100&is_active=true`
   (paginated through `next` URL).
3. For each match, run `mapInWaves(items, waveSize=4, gapMs=1000, fn)`
   where `fn` does `Promise.all([getCandidate, getCandidateSocialMedia,
   getCandidateAttachments])`.
4. Extract: name, stage_name, stage_rank, linkedin_url (from social-media
   array), has_resume (from `candidate.resume`), attachment_count, email,
   current_company/position, description, `candidate_report_html` from
   `custom_fields.candidatereport`.
5. Mark all existing rows for the job `is_active_match = false`.
6. Upsert fresh rows on conflict `(manatal_job_id, manatal_match_id)`,
   using preserved slugs for any existing match_id.
7. Re-read and return the active rows ordered by `stage_rank desc,
   candidate_full_name asc`.

### Token bucket (lib/manatal.ts)

Module-scoped singleton. Cap **60**, refill **1 token/sec**. Every
`manatalFetch` first calls `bucket.acquire()`. This caps our app to
~60 req/min sustained — leaves headroom under Manatal's 100/60s global
limit (which is shared with the user's Zapier flows).

`manatalFetch` ALSO writes a row to `sync_log` for every call (success
or failure), with `manatal_job_id` if the caller passed `jobIdForLog`.
Currently only `listJobMatches` passes the job id; per-candidate calls
are logged with `manatal_job_id = null`.

### Wave timing math

For a typical 20-candidate refresh:
- 1 matches list + 20 × 3 endpoints = 61 reqs
- 5 waves of 12 reqs each (4 candidates × 3 endpoints), 1s gaps
- Bucket starts at 60: drains 60 → 48 → 36 → 24 → 12 → 0
- Plus per-request latency ~300ms × 5 waves and 4 × 1s gaps
- **~6 seconds wall** if bucket is full going in
- Sustained rate (back-to-back portals): **~1 minute per portal**

For a full cron sweep with ~10 active portals (≈ Talental's typical load):
**~10 minutes wall**, fits comfortably in the 15-min cron interval.

### TTL / freshness

- On-demand check: `now - oldest(last_synced_at) > 15 min` triggers refresh.
- Cron skip: same 15-min threshold; cron logs `"skipped (age Xm)"`.
- Auto-warm: always fires (cache is empty for a brand-new portal).
- Manual "Refresh now": bypasses the TTL but goes through the lock.

---

## 5. Slug stability (deep-link feature)

`candidate_slug` is generated **once** per `(manatal_job_id, manatal_match_id)`
and never regenerated. Implementation:

- `refreshJobCache` pre-fetches `select manatal_match_id, candidate_slug
  from candidate_cache where manatal_job_id = $1` before fan-out.
- Builds a `Map<match_id, slug>`.
- For each match in the new fetch: `slug = existingMap.get(match.id) ?? newCandidateSlug()`.
- Upserts on conflict `(manatal_job_id, manatal_match_id)` so update-vs-insert
  is decided by Postgres, but the slug we send is always the existing one when present.

Generation: 12-char `nanoid` over `[a-z0-9]` (62 bits of entropy).
Existing rows backfilled in SQL with `lower(encode(gen_random_bytes(6), 'hex'))`
(48 bits via hex; mixed alphabet is fine since uniqueness is per-job, not global).

If we ever build a feature that wants to delete-and-recreate a candidate,
this constraint becomes load-bearing — don't break it without thinking.

---

## 6. Authentication / authorization

### Public portals (`/p/[slug]`, `/p/[slug]/c/[candidateSlug]`)
**No auth.** The slug IS the secret. 12 chars × 36-char alphabet ≈ 62 bits.
Server validates:
- `portal_links.slug = ?` AND `is_active = true`
- AND (`expires_at IS NULL OR expires_at > now()`)

If slug is unknown / inactive / expired → `notFound()`.

### Admin (`/admin/*`)
Single shared password (`ADMIN_PASSWORD` env). `lib/auth.ts`:
- POST `/api/admin/login` → constant-time compare → sets HTTP-only cookie
  `talental_admin = <issued_at>.<HMAC-SHA256(issued_at, ADMIN_PASSWORD)>`
- TTL: 7 days
- Rotating `ADMIN_PASSWORD` invalidates all sessions (signing key changes).
- `lib/auth.ts:isAdmin()` verifies the cookie on every protected request.

Route grouping: `app/admin/(protected)/` enforces auth via its layout
`redirect("/admin/login")` if not admin. `/admin/login` is OUTSIDE the
group, so it doesn't recursively bounce.

### Cron (`/api/cron/refresh-portals`)
`Authorization: Bearer ${CRON_SECRET}`. Constant-time compare. Vercel
cron sets this header automatically when the env var is set; for
external schedulers (cron-job.org) the header is configured manually.

### Supabase
**Service role key only** — used server-side. The anon/publishable key
is in env but the codebase doesn't actually use it (the `@supabase/ssr`
package is installed but never imported). All RLS-enabled tables are
default-denied for anon, so even if the anon key leaked it can't read
anything.

---

## 7. Manatal API quirks (verified empirically)

### Auth
- Header: `Authorization: Token <value>` (NOT `Bearer`).
- Wrong scheme → `"Authentication credentials were not provided."`
- Wrong value with right scheme → `"Invalid token."`

### Rate limit
- **100 req / 60s rolling**, GLOBAL across all consumers of the same token.
- Talental's Zapier flows use the same token, so we cap at ~60 req/min.
- 429 response body: `{"detail":"Request was throttled. Expected available in N seconds."}`

### Search params silently ignored
- `/jobs/?search=...` — returns unfiltered list.
- `/jobs/?position_name__icontains=...` — returns unfiltered list.
- `/candidates/?search=...` — returns unfiltered list.
- → Filter client-side. Always.

### Job → organization resolution
- `job.organization` is a **numeric id**, not an embedded object.
- Resolve via `GET /organizations/?page_size=100` once and join.

### Pagination
- `next` field on the response is an **absolute URL** (e.g.,
  `https://open.api.manatal.com/open/v3/jobs/...?page=2`).
- Strip `/open/v3` to get a relative path before passing back to our fetcher.

### Candidate detail (`/candidates/{id}/`)
Returns top-level fields incl. `id`, `external_id`, `full_name`, `email`,
`phone_number`, `current_company`, `current_position`, `description`,
`address`, `candidate_location`, `candidate_tags` (array of `{tag_name,
tag_color}`), `custom_fields`, `created_at`, `updated_at`, **AND `resume`
(the signed download URL when one exists)**.

`resume` is `null` for sourced LinkedIn leads. Use `Boolean(candidate.resume)`
to set `has_resume`. The URL itself expires after a few hours — don't persist.

### `/candidates/{id}/resume/`
**Always returns 404** (`{"detail":"Not found."}`) for every candidate
we tested. Don't call it. Resume URL is at `candidate.resume` per above.

### `/candidates/{id}/social-media/`
Returns an **ARRAY** of social media entries, not a singular object.
Each entry shape:
```js
{
  social_media: "LinkedIn",
  social_media_slug: "linkedin",
  social_media_url: "https://www.linkedin.com/in/...",
  social_media_data: { url, name, photo, summary, ... },
  username: "...",
  ...
}
```
Extract LinkedIn by finding the entry where
`social_media_slug.toLowerCase() === "linkedin"`. Read `social_media_url`,
fall back to `social_media_data.url`, fall back to building from `username`.

### `/candidates/{id}/attachments/`
Returns either an array OR `{results: [...]}`. Handle both. Each item
has `id`, `name` or `file_name`, `file` or `url` for the download URL
(also short-lived).

### `/candidates/{id}/notes/` · `/activities/`
Both work (200). Other sub-resources (`/comments/`, `/reports/`,
`/assessments/`, `/scorecards/`, `/interviews/`, `/evaluations/`) return
Manatal's marketing 404 page — they're not real API endpoints.

### `/matches/?candidate=X`
Cross-job match lookup for one candidate. Works. Useful when you have
a candidate id and want to find their match in a specific job.

### Match shape
- `match.candidate` is sometimes a number (id), sometimes an object with
  `{id, full_name}`. Always handle both.
- `match.stage` is `{id, name}`.
- `match.job_pipeline_stage` is `{id, job_pipeline: {id, name}, name, rank}`.
  **`rank` is the canonical ordering** (higher = more advanced). In
  Talental's pipelines: Sourced=1, Contacted=3, Talental Interview=4,
  Sent to Client=5, Client Interview 1=6.
- `match.is_active` filters via `?is_active=true`.
- `match.custom_fields` exists but is consistently empty in Talental's
  current data — the candidate report lives on the CANDIDATE, not the match.

### Custom fields
- `candidate.custom_fields` is an object (possibly empty `{}`).
- Talental's automation writes the candidate report HTML to the key
  `candidatereport` (one word, lowercase, no underscore).
- Sourced/early-stage candidates have `custom_fields: {}`.

### Candidate sources
- `source_type: "sourced"` candidates are LinkedIn-scraped leads. They
  typically have **no resume**, **empty description**, **empty
  custom_fields**. Don't assume "missing data = bug" until you've checked
  source_type.

---

## 8. Production setup

### Supabase
- Project: `ogjwwxfnjoznjwavccwn` (Talental Client Portal, us-west-2).
- Two other projects in the same org are unrelated to this portal:
  - `vejehradjrquxahebtda` — JD Optimizer
  - `mngnvedzypebjtpdciyh` — AICV (inactive)

### Vercel
- **Plan: Hobby (current).**
- `vercel.json` has `"schedule": "*/15 * * * *"` for `/api/cron/refresh-portals`.
- **Hobby cron limitation: daily-only, max 2 crons.** Vercel will accept
  the `*/15` schedule but only invoke it ~once per day. Until upgraded
  to Pro, cron is driven externally by [cron-job.org](https://cron-job.org).
- Migration to Pro: just upgrade — the same `vercel.json` schedule will
  start firing at the right cadence. Disable cron-job.org at that point
  to avoid double sweeps.
- **Domain target**: `clients.talental.mx`. Not yet wired.

### cron-job.org (current production trigger)
Setup steps documented in the README. Specifically:
- URL: `https://clients.talental.mx/api/cron/refresh-portals`
- Schedule: every 15 minutes (`*/15 * * * *`)
- Method: GET
- Header: `Authorization: Bearer <CRON_SECRET>`

### Env vars (`.env.local.example` → set in Vercel project settings)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MANATAL_API_TOKEN=
ADMIN_PASSWORD=
NEXT_PUBLIC_SITE_URL=https://clients.talental.mx
CRON_SECRET=
# optional dev-only: DEBUG_CACHE_DELAY_MS=5000
```

### Secrets that were shared during development (rotate before going live)
- Supabase service-role key (`sb_secret_...`)
- Manatal API token (currently `299da23f...`)
- Admin password (`tADMIN97_rata540!`)
- `CRON_SECRET` (locally-generated 64-hex; OK to keep, never left the machine)

These were pasted into chat during dev. Recommend regenerating before
prod traffic. The Manatal token was previously rotated once already
(an earlier `grn_...` value from a different ATS got pasted by mistake).

---

## 9. Key UI / UX patterns

### Streaming Suspense on the public portal (`/p/[slug]`)
- Header + footer render immediately.
- `<Suspense fallback={<CandidatesLoading />}>` wraps `<CandidatesList>`.
- Page is `dynamic = "force-dynamic"`, `revalidate = 0`, `fetchCache = "force-no-store"`.
- Empty state ("No candidates yet") only renders **after** the refresh
  has completed and confirmed zero rows. Never speculatively.
- Dev knob: `DEBUG_CACHE_DELAY_MS=5000` injects a 5s sleep into
  `refreshJobCache` so you can verify the streaming behavior.

### Counters strip + tabs (above the list)
Three inline metrics at the top of `/p/[slug]`:
- **In Process** — `is_active_match = true AND submitted_at IS NULL`
- **Submitted** — `submitted_at IS NOT NULL` (historical)
- **Rejected** — `dropped_at IS NOT NULL` (historical)

Computed in `getCandidateCountersForJob(jobId)` (single SELECT, in-memory aggregate).

Two-tab navigation below the counters:
- **Pipeline** — the candidate list (default).
- **Job Description** — sanitized `portal_links.job_description`. Falls back to a muted "Job description not available." card when null.

Tab state is URL-driven (`?tab=jd`) so it's shareable and survives reload.

### View toggle (table / kanban)
Small segmented control above the list, alongside the "Updated X ago" label. Defaults to table on every page load — never persisted.
- **Table view** — the original compact list.
- **Kanban view** — columns by `stage_name`, ordered by ascending `stage_rank`. Headers tinted via `classesForStage` (shared with `StageBadge`). Mobile collapses to vertical sections.

### Compact table on the list page
Columns: Name · Position · Company · Location · Current Comp · Stage · LinkedIn · Files · Notes · Report.
Sort: `stage_rank desc nulls last`, then `candidate_full_name asc`.
Stage colors progress through the funnel:
- Sourced/Applied: light gray
- Contacted/Engaged/Screening: sky blue
- Generic Interview / Talental Interview: violet
- Client Interview / Sent to Client / Client Offer: amber
- Won/Hired/Offer Accepted/Placed: emerald
- Rejected/Dropped/Lost/Withdrawn: muted rose
- Unknown: brand blue (fallback)

### Detail page layout
- `max-w-7xl`. Header chrome hosts: "Back to pipeline" link + prev/next
  arrow buttons + keyboard hint (`← → to navigate`) on the left, Talental
  logo on the right.
- Body: small breadcrumb (CLIENT · POSITION) → single-row identity
  cluster: H1 (text-xl), stage badge, position@company subtitle, and
  icon-only LinkedIn / email buttons — all left-aligned, no stretched gap.
- Two columns (`lg:grid-cols-2`):
  - Left: Candidate Report (sanitized HTML rendered with Talental
    typography — Inter, 14px body, h1=20px, h2=17px, h3=15px,
    line-height 1.5). Falls back to `description`, then to a soft
    "No detailed report yet" callout.
  - Right: Resume `<iframe>` streaming the PDF inline through our
    `/api/files/resume/{id}` route, with hash params
    `#toolbar=1&navpanes=0&view=FitH`.
- Below: lazy `<AttachmentsSection>` (only renders if non-empty), then
  the inline `<NotesPanel>` (form + reverse-chronological list).
- Prev/next nav uses the same ordering as the table; supports left/right
  arrow keyboard shortcuts (with `INPUT`/`TEXTAREA` opt-out).
- Experiences/educations sections were intentionally REMOVED.

### Resume serving
- `GET /api/files/resume/[candidateId]` re-fetches `candidate.resume`
  (always-fresh signed URL), then **streams** the PDF bytes through our
  origin with `Content-Type: application/pdf` and
  `Content-Disposition: inline`. The iframe renders without forcing a
  download.
- When `has_resume` cache is stale (Manatal cleared the URL since the
  last refresh) or upstream fails, the route returns a small `text/html`
  page ("No resume on file for this candidate.") so the iframe stays
  readable instead of showing raw JSON.
- For attachments, we 302-redirect (not stream) — they open in new tabs
  on the candidate detail page.

### Resume modal (table column)
- Single icon (lucide `Files`) per row.
- Hidden entirely when `has_resume === false`.
- Click opens a modal with the same iframe-embedded PDF as the detail
  page. Attachments are NOT in this modal — they live only on the
  detail page's `AttachmentsSection`.

### Notes
- API: `GET / POST /api/portal/[slug]/candidates/[candidateSlug]/notes`,
  guarded by `lib/portal-access.ts` (active portal + non-expired + valid
  candidate slug). POST validates trimmed `author_name` and `note_text`
  (length-checked > 0, max 80 / 4000 chars).
- UI surfaces: a "Notes" column icon (`PencilLine`) on every row that
  opens `NotesModalButton`, plus an inline `NotesPanel` section on the
  candidate detail page. Both reuse the same client component.
- Form: required name input + textarea + Add note button. List below
  shows newest first with relative timestamps. Empty state copy:
  "No notes yet. Be the first to leave one."

### Report modal
- Trigger: lucide `FileUser` icon (a person on a paper).
- Disabled state when `candidate_report_html` is null (gray + tooltip
  "No report yet").
- Modal: 3xl wide, scroll-internal for long reports, X + ESC to close.
- Body uses the same `<ReportBody>` component that the detail page uses,
  so the typography is consistent.

### Brand
- Logo: `/public/talental-logo.svg` (the actual Talental wordmark; the
  earlier text-based placeholder was replaced).
- Brand color `#1565E0`, set as `--color-brand` in globals.css.
- Inter font everywhere, loaded via `next/font/google`.

---

## 10. Implementation patterns / conventions

### Token bucket
`new TokenBucket(capacity=60, refillPerSec=1)` module-scoped in
`lib/manatal.ts`. Every `manatalFetch` calls `await bucket.acquire()`.
Don't bypass — every Manatal call must go through `manatalFetch`.

### Wave batching
`mapInWaves(items, waveSize=4, gapMs=1000, fn)` in `lib/cache.ts`.
Per wave: `Promise.all(wave.map(fn))`. Inter-wave: `setTimeout(gapMs)`.
Inside `fn` we fan out per-candidate endpoints with `Promise.all`. With
3 endpoints/candidate and wave_size=4 we burn 12 tokens per wave, comfortable.

### Advisory lock
`refresh_locks` table + RPC pair. 5-min lease (`REFRESH_LOCK_LEASE_MS`).
The `try_acquire_refresh_lock` RPC uses `INSERT ... ON CONFLICT DO UPDATE
WHERE refresh_locks.expires_at < now()` — atomically grabs the row if
no one holds it OR the holder's lease expired. Returns `acquired_at` on
win, NULL on contention.

`release_refresh_lock` matches both `manatal_job_id` and `acquired_at`
in the DELETE — so we never release someone else's lock that we
might have stolen-after-expiry.

### Slug preservation
Pre-fetch existing slugs into a `Map` BEFORE fan-out, attach them to
each upserted row. `onConflict: "manatal_job_id,manatal_match_id"`.
Never regenerate.

### `after()` for fire-and-forget
Background work (auto-warm) goes through `import { after } from
"next/server"`. On Vercel this becomes `waitUntil`, on local dev it
just runs after the response is flushed. Don't `await` background
work in route handlers — it'll add to the response time.

### Server actions
Use for admin-only mutations that revalidate. The `refreshPortalAction`
in `app/admin/(protected)/portal-actions.ts` is the canonical example.
It calls `tryRefreshJobCache`, handles contention, calls
`revalidatePath("/admin")`.

### Sanitization
Every untrusted HTML string runs through `sanitizeReportHtml` from
`lib/report-html.ts` BEFORE rendering with `dangerouslySetInnerHTML`.
Allowlist: `p, br, h1-h6, ul, ol, li, strong, b, em, i, a, blockquote,
code, hr`. Allowed attributes: `href, title` on `a`. Auto-rewrites
`<a target="_blank" rel="noopener noreferrer">`.

### Error logging in cron
The cron route writes a row to `sync_log` for EVERY portal it processes
(refresh / skip-TTL / skip-contended / error). Status code is 200 for
success/skip and 500 for errors; the message includes the slug and
job_id for filtering. Use this to audit: `SELECT * FROM sync_log WHERE
endpoint = 'cron-refresh' ORDER BY created_at DESC LIMIT 50`.

### `.vercelignore`
`scripts/` is excluded from Vercel uploads — diagnostic-only, never part
of runtime. Each script has a top-of-file comment "Diagnostic only —
not part of production runtime" so future-you doesn't get confused.

---

## 11. Known data state in production DB

These rows are TEST data that can be deleted or kept as Emanuel
prefers:

- `portal_links` row `hfv8sf9m984s` — "Auto-Warm Test" against
  Sr Tech Recruiter (job 3826951). Created during the auto-warm
  verification.
- `portal_links` row `sgddemoportal` — "Demo Client" against
  Sr Growth Director (job 3826949). Created to demo the report modal
  with Isabel Gutierrez. Cache row for Isabel was hand-seeded via SQL
  and `scripts/fix-isabel.mjs`.
- `portal_links` row `iu1fcsltusxh` — "Alertyx" against Account
  Executive (SaaS/Logistica) (job 3821171). REAL portal Emanuel
  created to test the build. Some Alertyx candidates' names + LinkedIn
  URLs were patched via direct SQL after rate-limit-induced fallbacks
  during testing — the next clean cron sweep will overwrite with real
  Manatal data.
- `portal_links` row `pnti394ras9b` — Canva, Sr Paid Media Manager
  (job 3827572). REAL.
- `portal_links` row `f75j39dtpb8p` — job 3827571 (Country Manager
  Argentina). Probably created by Emanuel.

`sync_log` has thousands of entries from testing. Consider a periodic
trim job (`DELETE FROM sync_log WHERE created_at < now() - interval '30 days'`)
once in production.

---

## 12. Pending / not yet built

In rough priority order:

1. **Secret rotation before going live.** Manatal token, Supabase
   service-role key, admin password were all pasted into chat. Recommend
   rotating immediately after deploy.
2. **Trim `sync_log` periodically.** Will balloon over time.
3. **Possibly: a Manatal-side health check.** If the API token gets
   revoked, every refresh will silently 401 and our app will keep
   serving stale data forever. A periodic admin-visible warning when
   the most recent successful Manatal call is > N hours old would be
   useful.
4. **Decision-pending: the 5 unused `raw_*_json` columns** on
   `candidate_cache`. Added during a deferred deep-link iteration where
   we briefly cached experiences/educations/attachments. We pulled the
   feature back but left the columns. Either populate them again (if
   Emanuel ever wants offline-style detail page rendering) or drop them
   in a cleanup migration.

## 12a. v1 complete — what's intentionally NOT built

The following are deliberately out of scope for v1.0.0 and can be
revisited if/when there's demand:

- **Bulk admin actions** (deactivate / delete multiple portals at once).
  Single-row toggles only.
- **Edit / delete notes.** Notes are append-only by design; clients
  treat the log as a permanent record. If a note needs to come down,
  Emanuel can do so via direct SQL.
- **Drag-and-drop kanban.** Cards are read-only; reordering would have
  to write back to Manatal, which is out of scope.
- **Candidate tags / "A-List" badge.** `candidate_tags` is populated on
  some Manatal candidates but not surfaced in the UI.
- **Dark mode.** Single theme.
- **Custom per-client branding pass.** Logo/colors are Talental-only.
- **Native Manatal notes ingest.** Notes are Talental-portal-only;
  `/candidates/{id}/notes/` from Manatal is not pulled.
- **Real-time updates.** Last-updated label refreshes only on page load.

---

## 13. Things to NOT change without thinking

- Don't bypass `tryRefreshJobCache` for any new refresh path. Concurrent
  refreshes will collide on Manatal's rate limit.
- Don't regenerate `candidate_slug` on upsert. Existing portal links
  shared with clients will 404.
- Don't drop the explicit GRANT to `service_role` on any table. MCP-created
  tables don't auto-grant.
- Don't increase the token bucket cap above 60 without checking with
  Emanuel — it's calibrated to leave headroom for his Zapier flows.
- Don't change `target="_blank"` on the LinkedIn / mailto / attachment
  links without checking — clients may be opening these from email.
- Don't call `getCandidate` for resume detection. The 404 from
  `/candidates/{id}/resume/` is genuine for every candidate. Use
  `Boolean(candidate.resume)` from the detail response.

---

## 14. Memory / context Claude already has

The `~/.claude/projects/-Users-eman-Projects-talental-clients-portal/memory/`
directory has these files that Claude reads automatically at session start:

- `MEMORY.md` — index
- `user_emanuel.md` — user profile
- `feedback_preapproved_actions.md` — npm/git/SQL pre-approved
- `project_clients_portal.md` — project overview (out of date now,
  could use a refresh)
- `reference_supabase_projects.md` — Supabase project IDs
- `reference_manatal_api.md` — Manatal API reference (good, fairly
  up-to-date)
- `feedback_supabase_mcp_grants.md` — the MCP grant gotcha

These are auto-loaded. The PROJECT_HANDOFF.md (this file) is the
deeper, code-level companion to those.

---

## 15. How to start the dev server

```bash
cd /Users/eman/Projects/talental-clients-portal
npm install              # if node_modules missing
npm run dev              # http://localhost:3000
```

Login at `/admin/login` with the password in `.env.local`. The
`Claude_Preview` MCP is configured via `.claude/launch.json` to launch
the same server.

Useful one-liners:
```bash
# Force a refresh by hitting a stale portal:
curl -s -o /dev/null -w "ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
  http://localhost:3000/p/iu1fcsltusxh

# Trigger the cron manually:
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2)
curl -s -H "Authorization: Bearer $SECRET" \
  http://localhost:3000/api/cron/refresh-portals | jq

# Check token bucket health (sync_log statuses in last minute):
# (run via MCP execute_sql)
SELECT status_code, count(*) FROM sync_log
WHERE created_at > now() - interval '1 minute'
GROUP BY status_code;
```

---

End of handoff.
