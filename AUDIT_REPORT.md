# atese.ai — Audit Report

Audit run on the working tree at
`/Users/eman/Projects/talental-clients-portal/.claude/worktrees/adoring-proskuriakova-6f7bee/`.
Read-only audit. No code modified, no installs, no builds.

---

## 1. Stack actual

| | |
|---|---|
| Framework | **Next.js 16.2.4 (App Router)** with Turbopack dev. ⚠️ Off-the-beaten path — Next 16 is current major, but most LLM training data is for Next 14/15. The repo's `AGENTS.md` explicitly warns "this is NOT the Next.js you know." |
| TypeScript | Yes, **strict: true**. Path alias `@/*` → repo root. |
| React | **19.2.4** (RC-era APIs in production: `useOptimistic`, etc.) |
| UI | Tailwind v4 (PostCSS plugin), hand-rolled shadcn-style components in `components/ui/`, Radix primitives (Dialog, DropdownMenu only) |
| Auth | **Single shared password** (`ADMIN_PASSWORD` env) via HMAC-signed cookie in `lib/auth.ts`. Not Supabase Auth. Not multi-user. |
| DB | **Supabase Postgres**, project id `ogjwwxfnjoznjwavccwn`. No ORM. Direct `@supabase/supabase-js` v2.105 with hand-typed row interfaces. RLS enabled on every table but no user-level policies (service role bypasses everything). |
| AI | **Anthropic SDK** `@anthropic-ai/sdk` v0.95. Model used: `claude-haiku-4-5` for resume parsing via tool-use. |
| Email | **Not installed.** No Resend, SendGrid, etc. |
| Storage | **Supabase Storage** bucket `hiring-resumes` (private, 10 MB, PDF-only allowlist). Signed URLs minted on demand. |
| Hosting | Vercel (production at `clients.talental.mx`, per README). The atese.ai surface has not been deployed. |
| External APIs in client bundle | Google Maps Places JS (location autocomplete), Clearbit `autocomplete.clearbit.com` (company autocomplete + favicon for logos). Both unauthenticated, sent every keystroke. |

---

## 2. Estructura de carpetas

```
.
├── app
│   ├── admin
│   │   ├── (protected)         ← atese.ai surface (Roles, Companies)
│   │   │   ├── hiring
│   │   │   │   ├── [roleId]
│   │   │   │   │   ├── analytics       (stub)
│   │   │   │   │   ├── client-portal   (stub)
│   │   │   │   │   ├── job-posting     (stub)
│   │   │   │   │   ├── sequence        (stub)
│   │   │   │   │   ├── settings        (real: edit + delete)
│   │   │   │   │   └── tracking        (real: kanban + slide-over)
│   │   │   │   ├── companies
│   │   │   │   └── new
│   │   │   └── portals          ← LEGACY Manatal admin (kept untouched)
│   │   └── login
│   ├── api
│   │   ├── admin                ← Manatal admin endpoints (login, logout, jobs, portal-links)
│   │   ├── cron                 ← Manatal: refresh-portals
│   │   └── portal               ← Manatal: client-facing file proxies
│   └── p
│       └── [slug]               ← LEGACY Manatal client portal (Talental's existing customers)
├── components                   ← Mix: Manatal portal components + ui/ (shadcn-style primitives)
│   ├── icons
│   └── ui
├── lib                          ← Auth, supabase, hiring (atese.ai), manatal cache, formatters
├── public
└── scripts                      ← Manatal probes + one Supabase test (no atese.ai scripts)
```

No empty directories detected. Mixed-purpose repo: ~half is legacy Manatal-era code for Talental's
old client portal, ~half is the atese.ai SaaS surface being built on top.

---

## 3. Modelo de datos actual

DB has **two clearly separated namespaces**: `public.*` (Manatal/legacy) and `hiring.*` (atese.ai).

### `hiring.*` schema — atese.ai

Tables (37 total) with row counts. **All tables have `workspace_id` after the Phase 1.a multi-tenancy migration**:

| Table | Rows | Purpose |
|---|---:|---|
| `workspaces` | 1 | Tenant root. Seeded with "Talental". Has `slug`, `plan_tier` enum, `trial_ends_at`, Stripe customer/subscription cols. |
| `team_members` | 0 | Per-workspace user records. Has `auth_user_id` for future Supabase Auth migration. **Currently empty** — no auth integration. |
| `clients` | 1 | Vestigial pre-multi-tenant billing-context entity. Now overlaps with `companies.client_id`. |
| `companies` | 2 | Master company list. `status` enum (none/prospect/client/partner). Has `domain`, `logo_url`, `linkedin_url`. |
| `contacts` | 0 | BD targets at companies. Empty — no UI yet. |
| `deals` | 0 | BD pipeline (own stages: lead/qualified/.../won/lost). Empty — no UI. |
| `roles` | 1 | Job openings. Has FK to companies + clients. AI scoring config columns. Lat/lng for Google Places. |
| `pipeline_stages` | 12 | Per-role stage list. Categories enum (sourced/contacted/.../hired/rejected/withdrawn). |
| `candidates` | 2 | People. Has `resume_url` (storage path), `resume_text`, `parsed_profile` (jsonb). |
| `applications` | 2 | candidate × role × stage. Has denormalized `category` synced via trigger. |
| `screenings` | 0 | Agentic-flow placeholder (chatbot/voice screening). No UI. |
| `interviews` | 0 | AI video interview placeholder (ElevenLabs + Cloudflare Stream cols). No UI. |
| `submissions` | 0 | Anonymized candidate sent to client. No UI. |
| `payments` | 0 | Stripe events placeholder. No UI. |
| `unlocks` | 0 | "Client paid to reveal candidate" agentic flow. No UI. |
| `application_events` | 7 | Audit log. Trigger writes on stage change. |
| `tags` + `entity_tags` | 1 + 1 | Polymorphic tagging across 6 entity types. UI exists for applications only. |
| `notes` | 1 | Polymorphic notes. UI exists for applications + companies. |
| `tasks` | 0 | Polymorphic todos. No UI. |
| `rejection_reasons` | 20 | Toggleable Leonar-style taxonomy, seeded with defaults. No UI to manage. |
| `sequences` + `sequence_steps` + `sequence_enrollments` | 0+0+0 | Outreach automation. No UI. |
| `conversations` + `messages` | 0+0 | Unipile messaging shell. No UI. |
| `custom_field_definitions` + `custom_field_values` | 0+0 | Per-entity custom fields. No UI. |
| `role_owners` | 0 | Multi-owner join table. No UI. |
| `role_client_portal_settings` | 0 | Per-role client-portal config. No UI. |

**Multi-tenancy: PARTIAL.** Schema is fully multi-tenant (`workspace_id NOT NULL` on all 29 tenant
tables, FK with cascade). But **RLS policies are deny-all for non-service-role users**; isolation
is enforced **manually in server actions** (only ~8 actions filter by `workspace_id`). When auth
migrates to Supabase Auth, this will need real per-user RLS. A temporary shim
`getRequestWorkspaceId()` in `lib/hiring.ts:194` always returns the Talental workspace ID — not
session-aware.

### `public.*` schema — legacy Manatal

| Table | Rows | Purpose |
|---|---:|---|
| `portal_links` | 1 | Slug → Manatal job mapping. Used by `/p/[slug]` |
| `candidate_cache` | 452 | Cached Manatal candidate data |
| `candidate_notes` | 0 | Per-candidate notes |
| `sync_log` | **312,407** | Append-only Manatal API call log. Never pruned. **Will be expensive on Supabase soon.** |
| `refresh_locks` | 0 | Per-job mutex |
| `interview_sessions` + `interview_messages` | 1+1 | Some other AI interview prototype. Unrelated to current atese.ai schema. |

### TypeScript representation

`lib/hiring.ts` (568 lines). Hand-rolled row types for 21 entities + 4 JSON-shape types. All have
`workspace_id: string` after the migration. No generated types.

---

## 4. Rutas y pantallas existentes

### atese.ai (product) routes
| Route | Purpose | State |
|---|---|---|
| `/admin` → redirect to `/admin/hiring` | Entry point | ✅ |
| `/admin/login` | Login page (single-password). Branded "atese.ai". | ✅ |
| `/admin/hiring` | Roles list with company chip + status + counts | ✅ |
| `/admin/hiring/new` | Create role: company combobox (DB + Clearbit web suggest), Google Places location, comma-formatted salary, public description | ✅ |
| `/admin/hiring/[roleId]` → redirect to `/tracking` | | ✅ |
| `/admin/hiring/[roleId]/tracking` | **Pipeline kanban** (DnD with @dnd-kit + closestCorners), candidate slide-over | ✅ |
| `/admin/hiring/[roleId]/settings` | Edit basics + AI scoring criteria + delete with confirm | ✅ |
| `/admin/hiring/[roleId]/job-posting` | Stub — "Coming soon" | 🟡 |
| `/admin/hiring/[roleId]/client-portal` | Stub | 🟡 |
| `/admin/hiring/[roleId]/sequence` | Stub | 🟡 |
| `/admin/hiring/[roleId]/analytics` | Stub | 🟡 |
| `/admin/hiring/companies` | List with status pills, search, slide-over via `?company=`, linked roles + notes | ✅ |

### Legacy Manatal routes (untouched, will be removed)
| Route | Purpose |
|---|---|
| `/` | Marketing landing for Talental |
| `/p/[slug]` | Public client portal (Manatal-cached candidate list) |
| `/p/[slug]/c/[candidateSlug]` | Candidate detail page |
| `/admin/portals` | Manatal portal-links admin |
| `/admin/portals/new` | Create portal link |

### API routes
| Route | Purpose | Owner |
|---|---|---|
| `POST /api/admin/login` | Set HMAC-signed cookie | atese.ai (also used by Manatal) |
| `POST /api/admin/logout` | Clear cookie | shared |
| `GET /api/admin/jobs` | Manatal jobs list | Manatal |
| `POST /api/admin/portal-links` | Manatal portal CRUD | Manatal |
| `GET /api/cron/refresh-portals` | Manatal cache refresh | Manatal |
| `/api/portal/[slug]/candidates/[...]` (4 routes) | File proxies + notes for Manatal client view | Manatal |

**No API routes for atese.ai data.** Everything goes through Server Actions in
`app/admin/(protected)/hiring/actions.ts` (885 lines, 22 exported actions). The auth flow is the
only API route the product uses.

---

## 5. Componentes principales

`components/` — top-level (Manatal-era):
- `candidate-card.tsx`, `candidate-row.tsx`, `candidate-nav.tsx` — Manatal candidate list views
- `kanban-view.tsx` — **OLD kanban for Manatal portal** (separate from the atese.ai pipeline-board)
- `pipeline-view-toggle.tsx` — Manatal portal table↔kanban toggle
- `portal-counters.tsx`, `portal-disabled.tsx`, `portal-header.tsx`, `portal-tabs.tsx` — Manatal client portal chrome
- `report-body.tsx`, `report-modal-button.tsx`, `notes-modal-button.tsx`, `notes-panel.tsx`, `resume-modal-button.tsx`, `stage-badge.tsx`, `job-description-view.tsx`, `empty-state.tsx` — all Manatal portal UI
- `icons/linkedin-icon.tsx` — single icon

`components/ui/` — shared shadcn-style primitives, used by both Manatal and atese.ai:
- `badge.tsx`, `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `skeleton.tsx`

**atese.ai-specific components live colocated** under `app/admin/(protected)/hiring/...` — they are
NOT in `components/`. ~20 files: `pipeline-board`, `candidate-slideover`, `tag-picker`,
`resume-uploader`, `parsed-profile`, `notes-section`, `activity-section`, `company-combobox`,
`location-autocomplete`, `number-input`, `company-slideover`, `company-notes`,
`create-company-form`, `add-candidate`, `role-tabs`, `role-settings-form`, `delete-role-zone`,
`status-select`, `sidebar`.

**Verdict:** the `components/` top-level is 100% legacy Manatal. None of those components are
imported by atese.ai code.

---

## 6. Features funcionando vs rotos

| Feature | State | Notes |
|---|---|---|
| **Signup / multi-user login** | ❌ ausente | Single shared `ADMIN_PASSWORD`. No signup. No magic link. No Supabase Auth integration. |
| **Multi-tenancy (workspace isolation)** | 🟡 parcial | Schema is multi-tenant (workspace_id everywhere, NOT NULL). Service-role bypasses RLS. ~8 actions filter explicitly by workspace; pages don't filter at all. RLS policies missing. Effectively single-tenant in practice. |
| **Single-file resume upload** | ✅ funciona | Supabase Storage + signed URLs. PDF only. Tested by user. |
| **Bulk resume upload** | ❌ ausente | No bulk endpoint, no drag-drop multi-file, no email-forwarding ingest. |
| **Resume parsing (Claude)** | ✅ funciona | `lib/resume-parse.ts`, Haiku, tool-use. Auto-runs after upload. ENOENT bug fixed via inner-module import. |
| **Candidate dedup on upload** | 🟡 parcial | `addCandidateAction` dedupes by email/linkedin within workspace. No fuzzy match, no "looks like the same person" detection across uploads. |
| **List of candidates (talent pool)** | ❌ ausente | No `/admin/candidates` page. The only candidate view is per-role kanban + per-application slide-over. |
| **Search across candidates** | ❌ ausente | No global candidate search UI. No keyword search on `resume_text`. No vector embeddings. |
| **Pipeline / stages** | ✅ funciona | Per-role stages auto-seeded with 12 Leonar-style defaults. DnD kanban with optimistic updates. Stage moves logged to `application_events`. |
| **Tags** | ✅ funciona | Workspace-scoped, polymorphic, applied to applications. Pills render on cards. |
| **Notes (polymorphic)** | ✅ funciona | On applications + companies. Two near-duplicate components (`notes-section.tsx` + `company-notes.tsx`) — should be DRY'd. |
| **Activity timeline** | ✅ funciona | Reads `application_events`. Renders stage changes with from/to names. |
| **Companies CRM** | ✅ list + slide-over | Status filter pills, search, Clearbit web autocomplete on create. No edit UI for fields after creation. |
| **WhatsApp send** | ❌ ausente | No provider, no template management, no UI. |
| **Email outreach** | ❌ ausente | No Resend, no inbox, no templates. |
| **Sequences** | ❌ schema only | Tables exist (sequences/sequence_steps/sequence_enrollments), zero UI. |
| **Client portal (per-role)** | ❌ stub | Settings table exists, the page renders "Coming soon". |
| **Reports / analytics** | ❌ stub | Page renders "Coming soon". |
| **Stripe billing** | ❌ ausente | Schema has stripe_customer_id/subscription_id columns. No webhook, no checkout, no subscription UI. |

---

## 7. Dependencias notables

Beyond the Next.js + React + Tailwind + Radix baseline:

| Package | Why notable |
|---|---|
| `@anthropic-ai/sdk` 0.95 | Resume parsing. **Loaded server-side only.** Fine. |
| `@dnd-kit/core` 6.3 + `sortable` 8 + `utilities` 3 | Kanban DnD. **Heavy** for what could also be done with `react-aria` or native HTML5 drag, but it works and the integration is correct. |
| `@supabase/supabase-js` 2.105 | DB + Storage + Auth client. Standard. |
| `pdf-parse` **1.1.1** | ⚠️ **Pinned old version** because v2 (which we briefly installed) has a pdfjs-dist worker that breaks under Next/Turbopack. v1 has a notorious quirk: it tries to read a sample PDF on import — worked around by importing `pdf-parse/lib/pdf-parse.js` directly. Fragile. Consider replacing with `pdfreader` or `unpdf` (Vercel-friendly). |
| `nanoid` 5.1 | Used? Grep shows no imports in `app/` or `lib/`. **Probably dead.** |
| `sanitize-html` 2.17 | Used by Manatal report-body for HTML emails. **Not used by atese.ai.** Could move out when Manatal is deleted. |
| `lucide-react` **1.14.0** | ⚠️ **Very old** (current is 0.500+). The package versioning is weird — 1.14 is from years ago, before they reset to 0.x. Many new icon names missing (we hit this with `Linkedin`). Should bump to latest 0.x. |
| `class-variance-authority` 0.7 + `clsx` 2.1 + `tailwind-merge` 3.5 | Standard shadcn helpers. Fine. |

**Missing for the stated 4-sprint roadmap:**
- No Resend (Sprint 3 email outreach)
- No WhatsApp provider client (Twilio / WATI / Meta) (Sprint 3)
- No queue / background jobs (Sprint 1 bulk parsing — currently inline, will block requests on big batches)
- No Stripe SDK (atese.ai pricing is 500 MXN/user/mo — billing not started)
- No vector DB / embeddings (search will be keyword-only)

---

## 8. Env vars detectadas

| Var | In `.env.local` (worktree) | In `.env.local.example` |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ |
| `MANATAL_API_TOKEN` | ✓ | ✓ |
| `ADMIN_PASSWORD` | ✓ | ✓ |
| `NEXT_PUBLIC_SITE_URL` | ✓ | ✓ |
| `CRON_SECRET` | ✓ | ✓ |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | ✓ | ❌ **missing from example** |
| `ANTHROPIC_API_KEY` | ✓ | ❌ **missing from example** |

`.env.local.example` is stale — does not document the two AI/maps keys. Will trip up any future
contributor.

The **root** repo `.env.local` (at `/Users/eman/Projects/talental-clients-portal/.env.local`) is
NOT in sync with the worktree `.env.local`. The dev server reads from the worktree, but anyone
reading the root file would think Anthropic/Maps keys aren't set.

---

## 9. TODOs, FIXMEs, código sospechoso

`grep -rn "TODO|FIXME|HACK|XXX"` across `app/ lib/ components/`: **0 hits.**

The codebase has no explicit TODOs. That's not the same as no debt — see §6 and §11. Comment
density is high in the parts I touched recently (resume-parse, multi-tenancy migration, the
DnD hydration workaround).

Things flagged in code as "temporary" or "shim":
- `lib/hiring.ts:194` — `getRequestWorkspaceId()` is explicitly labeled "TEMPORARY SHIM — Phase 1.a".
- `app/admin/(protected)/hiring/[roleId]/tracking/pipeline-board.tsx:54-58` — `mounted` state to defer DnD render until after hydration. Works, but is a workaround for `@dnd-kit`'s incrementing IDs.

Suspicious-but-no-comment:
- `app/admin/(protected)/hiring/actions.ts:567` — `pdf-parse/lib/pdf-parse.js` deep import bypassing the package's broken index.js.
- `app/admin/(protected)/hiring/new/company-combobox.tsx` — sends every keystroke to clearbit.com unauthenticated. **Privacy concern in multi-tenant SaaS.** Currently no disclosure to the user.
- `app/admin/(protected)/hiring/new/location-autocomplete.tsx` — uses `google.maps.places.Autocomplete` which Google deprecated for new customers as of 2025-03-01. Console warns on every load.
- `app/admin/(protected)/hiring/companies/page.tsx` — query for `companies` does NOT filter by `workspace_id` (other pages have the same pattern). Currently fine because there's only one workspace, but breaks the moment a second workspace is created.

---

## 10. Decisiones previas a Claude Code

### `CLAUDE.md`
```
@AGENTS.md
```
(One line — re-routes to AGENTS.md.)

### `AGENTS.md`
```
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure
may all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
```

### `README.md` (first 80 lines)
```
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
[…installation, Supabase MCP grants warning, cache mechanism, file proxy mechanism…]
```

The README documents the **Manatal portal**, not atese.ai. There is no documentation for the
atese.ai surface anywhere in the repo. The strategic pivot to a multi-tenant SaaS happened in
chat sessions; only `.claude/.../memory/` files reflect it.

There are no `.cursorrules`, no `Architecture.md`.

---

## 11. Veredicto técnico

**Lo que está bien y debe conservarse:**

1. **Schema design.** The `hiring.*` schema is genuinely good: clean enum-driven categories, polymorphic notes/tags via `entity_type`, audit log via trigger, multi-tenancy migration done right (workspace_id NOT NULL with CASCADE, indexed). This is the strongest part of the project.
2. **Server-actions architecture.** Sticking to Next.js server actions instead of mixing API routes was the right call for a small product. `actions.ts` is long (885 lines) but coherent.
3. **Resume parsing pipeline.** `lib/resume-parse.ts` uses Claude tool-use with a typed schema — this is the modern, correct way to do structured extraction. Cost is negligible.
4. **The kanban implementation** finally works (after closestCorners fix + workspace_id trigger fix). Optimistic updates + DnD + hydration shim is a complex 3-way interaction and it lands correctly.

**Lo que está mal y debe morir:**

1. **`ADMIN_PASSWORD` cookie auth.** Single shared password is a non-starter for SaaS. Has to be ripped out and replaced with Supabase Auth before any external customer touches this.
2. **`getRequestWorkspaceId()` shim.** Currently always returns Talental. Until it reads from session, any second workspace breaks the entire app.
3. **Page-level reads have no `workspace_id` filter.** `/admin/hiring/page.tsx`, `/admin/hiring/companies/page.tsx`, `/admin/hiring/[roleId]/tracking/page.tsx`, etc. — all run un-filtered queries. With one workspace this works; with two it leaks data across tenants instantly.
4. **The `clients` table.** Half-vestigial after the companies refactor. Should be merged into `companies` (e.g. `companies.is_paying_client`) or made an explicit billing-only entity. Right now it's confusing.
5. **`components/` top-level is 100% Manatal.** Everything in there is dead weight for atese.ai. Either gets deleted with the Manatal teardown or moved into a `legacy/` folder.
6. **`scripts/` directory.** All Manatal probes. None used by atese.ai. Same fate as above.
7. **`lucide-react@1.14`.** Very old. Replace with the current 0.x line ASAP, before custom icons start getting added.
8. **README + `.env.local.example`** are stale. Documentation says this is the "Talental Client Portal." Anyone onboarded will be confused.

**Qué falta para llegar al Sprint 1 (ingestión de CVs en bulk):**

- Multi-file drag-drop uploader (UI)
- Background job runner (currently parsing is inline in the request — 200 CVs at ~3s each = 10 min request)
- Email-forwarding ingest (Resend or Mailgun routing → Supabase function → applications/candidates row)
- Fuzzy dedup (right now: exact email/linkedin only)
- Talent pool list page with filters (by skills, location, years exp, parsed_profile fields)
- (Optional but big lift for the UX) embedding-based search (~$0.0001 per CV with text-embedding-3-small)

That's roughly **2-3 weeks of focused work** if multi-tenancy + auth land first.

**Decisiones de arquitectura que chocan con el stack objetivo:**

- **RLS is enabled but no per-user policies.** The user wants Supabase RLS multi-tenancy. Service-role-only access right now means ALL tenant isolation is enforced manually in app code — a single forgotten `.eq('workspace_id', ...)` leaks data across tenants. RLS policies need to be added to enforce isolation at the DB layer, with anon/authenticated roles getting policies that check `workspace_members`. **This is the single biggest architectural risk.**
- **Auth is bespoke instead of Supabase Auth.** The whole app uses `@supabase/supabase-js` with the **service role key**. There's no concept of "the current user." Migration to Supabase Auth is a real project (server actions need session, RLS needs `auth.uid()`, every page needs the user context).
- **Resume storage paths use raw `candidate_id`** (no `workspace_id` prefix). When workspaces multiply, all storage paths share a flat namespace. Should be `{workspace_id}/{candidate_id}/{file}` for cleaner per-workspace deletion + audit.
- **No background jobs / queues.** Sprint 1 (bulk CV) won't work without one. Inngest, Trigger.dev, or just a Supabase Edge Function + cron are the standard answers.

**Riesgo principal de seguir construyendo encima:**

> Adding more features (Sprint 2+) without first adding **real auth + RLS policies + workspace-aware filtering on every page** means that the day you get a second customer, you ship a tenant data leak. That's a "lose your reputation in MX recruiting circles" event. Multi-tenancy debt compounds non-linearly — it's easier to fix now (1 workspace, 1 user) than later.

---

## 12. Tres caminos posibles

### Camino A — Refactorizar lo existente

**Estimado: 4–6 días de trabajo enfocado** to get the foundation production-ready.

What's conserved:
- The entire `hiring.*` schema (excellent already)
- The kanban + slide-over + resume parsing flow
- All the UI for roles/companies/tags/notes/activity
- The Server Actions architecture

What gets rehecho:
- Auth: rip `lib/auth.ts` ADMIN_PASSWORD, wire Supabase Auth (magic link or email/password). Estimated 1 day.
- `getRequestWorkspaceId()`: real session-based. ~½ day.
- RLS policies: per-user policies on every `hiring.*` table that join through `workspace_members`. ~1 day.
- Page-level reads: add `workspace_id` filter to every server component query. ~½ day.
- Storage paths: `{workspace_id}/{candidate_id}/{file}`. ~½ day with backfill for existing rows.
- Delete Manatal entirely from this repo (after Talental's last role finishes). ~½ day cleanup.
- README + .env.example refresh, branding pass. ~½ day.

After this, Sprint 1 can start cleanly. Total to MVP: ~3 weeks (foundation 4-6 days + Sprint 1 2-3 weeks).

**This is the path I'd pick.**

---

### Camino B — Empezar carpeta nueva, migrar lo poco rescatable

**Estimado: 7–10 días** before you're back to where the kanban works.

What gets brought:
- The `hiring.*` SQL migration files (recreated from current schema dump)
- `lib/resume-parse.ts` (~120 lines, copies as-is)
- `lib/format.ts` (~50 lines)
- `components/ui/*` (shadcn primitives, ~7 small files)
- The kanban DnD logic + closestCorners fix

What's lost / rebuilt:
- All routes
- All Server Actions
- `lib/hiring.ts` types (regenerated)
- Slide-over, tag picker, notes, activity, companies — all rebuilt
- Auth setup from zero

Worth it only if you also want to switch to a new Supabase project at the same time (clean slate
for atese.ai customers, no shared DB with Talental's Manatal data). The downside is real: most of
the recent work is in `app/admin/(protected)/hiring/` and that's the part that didn't change schema.

**I'd avoid this unless you want a separate Supabase project from day one.**

---

### Camino C — Mantener base, agregar Sprint 1 sin refactor

**Estimado: 2–2.5 weeks** to ship Sprint 1, but with significant deuda.

What you ship:
- Bulk upload UI on top of existing single-upload action
- Inline parsing (no queue) — works for batches up to ~30 CVs, breaks above
- Talent pool list at `/admin/candidates`, keyword search via Postgres `ilike` on `resume_text`
- Email-forward ingest as an Edge Function

What stays broken:
- Still single-password auth → can't onboard a second customer
- Still single workspace in practice (shim returns Talental)
- Page reads still don't filter by workspace
- No real RLS policies
- Storage paths still flat

Deuda total al terminar: everything in Camino A's "rehecho" list, plus whatever Sprint 1 added on top of the broken foundation. **Probably 5-7 extra days to fix later, with risk of having to rewrite parts of Sprint 1.**

**I'd only pick this if there's a specific Talental-internal deadline that needs Sprint 1 features
within the next 2 weeks and no second customer is coming soon.**

---

## TL;DR

> The schema is great, the UI works, the auth is fake, and multi-tenancy is enforced by the
> honor system. Spend a week on Camino A before shipping a second user, or you'll lose data
> across tenants the day a customer signs up.
