# HANDOFF

> Read this first. Then read `AGENTS.md`, then `CLAUDE.md`. Then ask Emanuel
> "¿qué sigue?" before doing anything. Do not assume "obvious" fixes.

---

## 1. Identidad del proyecto

- **Nombre interno:** Talental ATS (working code name `atese.ai` was discussed
  early; we settled on **Talental** for branding)
- **Qué es:** ATS multi-tenant para agencias de reclutamiento chicas en LATAM
- **ICP:** agencias de 1–5 recruiters que reclutan **publicando vacantes**
  (Computrabajo, OCC, Indeed, etc.) — no por LinkedIn hunting
- **Estado:** en desarrollo, producción en https://app.talental.mx
- **Owner:** Emanuel Galván (`emanuel@talental.mx`). Builds it himself, MX-based.
- **Talental como cliente #1:** se usa internamente como dogfood. Es el primer
  workspace en producción.

---

## 2. Stack

| | |
|---|---|
| Framework | **Next.js 16.2.4** (App Router, Turbopack dev). ⚠️ Next 16 has breaking changes vs 14/15 — `middleware.ts` is now `proxy.ts`, function name `proxy` not `middleware`. |
| Language | TypeScript strict mode |
| React | 19.2.4 (uses `useOptimistic`, `cache()`) |
| Styling | Tailwind v4 (PostCSS plugin) + hand-rolled shadcn-style primitives in `components/ui/` + Radix Dialog + Radix DropdownMenu |
| Icons | `lucide-react@0.577.0` (the `0.x` line — `1.x` dropped many icons) |
| Auth | **Supabase Auth** via `@supabase/ssr` 0.10. Magic link primary, password fallback. Session cookies handled by `proxy.ts` + `lib/supabase/server.ts`. |
| DB | **Supabase Postgres** (project ID `ogjwwxfnjoznjwavccwn`, region us-west-2). Schema: `hiring.*`. RLS enabled with real per-user policies. |
| AI | `@anthropic-ai/sdk` 0.95 — `claude-haiku-4-5` for resume parsing via tool-use |
| Storage | Supabase Storage, bucket `hiring-resumes` (private, 10 MB, PDF/DOCX). Paths workspace-scoped: `{workspace_id}/{candidate_id}/{file}` |
| DnD | `@dnd-kit` core 6.3, sortable 8 — for the pipeline kanban |
| PDF parsing | `pdf-parse@1.1.1` (deep import `pdf-parse/lib/pdf-parse.js` to bypass v1's debug-test ENOENT bug) |
| Maps | Google Maps Places JS API (legacy `Autocomplete`, deprecated for new customers but works) |
| Logo enrichment | Clearbit autocomplete + favicon (free, unauthenticated, deprecated but live) |
| Hosting | Vercel — `app.talental.mx` (Hobby plan; cron jobs disabled because Pro-only) |
| **Future (not yet integrated):** | Inngest (background jobs for bulk parsing), Unipile (LinkedIn/Email/WhatsApp messaging), Resend (transactional email), Stripe (billing) |

---

## 3. Estructura del repo

```
.
├── app
│   ├── (app)                     ← authenticated product surface
│   │   ├── companies             ← /companies list + slide-over
│   │   ├── jobs                  ← /jobs list + create
│   │   │   ├── [jobId]           ← job detail (kanban is the default page.tsx)
│   │   │   │   ├── description   (stub)
│   │   │   │   ├── portal        (stub)
│   │   │   │   ├── reports       (stub)
│   │   │   │   ├── sequence      (stub)
│   │   │   │   ├── settings      (real: edit + delete)
│   │   │   │   └── (kanban + slide-over components colocated at the root)
│   │   │   ├── new
│   │   │   └── (status-select.tsx)
│   │   ├── actions.ts            ← all server actions (single file, ~880 lines)
│   │   ├── layout.tsx
│   │   └── sidebar.tsx
│   ├── auth/callback             ← Supabase OAuth/magic-link exchange
│   ├── login                     ← /login (page + login-form + actions)
│   ├── layout.tsx                ← root layout
│   └── page.tsx                  ← redirects to /jobs (signed in) or /login
├── components
│   ├── icons                     ← single linkedin-icon.tsx
│   └── ui                        ← shadcn-style primitives
├── lib
│   ├── auth/session.ts           ← getSession, requireSession, getCurrentUser, isAuthenticated, signOutAction
│   ├── supabase
│   │   ├── admin.ts              ← service-role factory (use sparingly)
│   │   └── server.ts             ← auth-aware factory (default for app code)
│   ├── hiring.ts                 ← row types + enums + hiring()/hiringAdmin() schema-scoped clients
│   ├── format.ts                 ← formatSalaryRange, etc.
│   ├── resume-parse.ts           ← Claude tool-use schema for parsing
│   └── utils.ts                  ← cn()
├── proxy.ts                      ← Next 16 proxy (was middleware.ts pre-16)
└── scripts
    ├── bootstrap-emanuel.ts      ← creates first auth user + team_member
    ├── migrate-storage-paths.ts  ← one-shot backfill (already run)
    ├── test-rls-isolation.ts     ← cross-tenant RLS isolation test (9 checks)
    └── test-supabase.mjs         ← legacy probe
```

---

## 4. Decisiones de arquitectura tomadas (CRÍTICO)

1. **URLs en inglés, sin prefijo `/admin`.** Routes are `/jobs`, `/companies`,
   `/jobs/[jobId]/settings`, etc. The product is the entire authenticated app;
   there's no separate admin surface.
2. **UI labels en español, código en inglés.** Sidebar says "Vacantes",
   "Empresas"; entity types in code are `Job`, `Company`. Spanish = customer-
   facing, English = developer-facing. Never translate code identifiers.
3. **Per-job tabs:** `Candidatos` (default, kanban) / `Descripción de puesto` /
   `Secuencia` / `Portal del cliente` / `Reportes` / `Ajustes`. The kanban is
   the **default page.tsx** of `[jobId]`, not a `/tracking` sub-route. Don't
   reintroduce a "Tracking" tab.
4. **"Talental" branding is tentative.** Used in sidebar, login, root metadata.
   If Emanuel decides to white-label later, this becomes a workspace-scoped
   field on `hiring.workspaces`. Don't hardcode it deeper without asking.
5. **Multi-tenancy = workspace_id everywhere.** Every tenant table has
   `workspace_id NOT NULL` referencing `hiring.workspaces(id)` on cascade.
6. **RLS policies are real and tested.** All `hiring.*` tables enforce
   `workspace_id IN (SELECT hiring.user_workspace_ids())` for SELECT/INSERT/
   UPDATE/DELETE. Special policies on `team_members` (own-row UPDATE only) and
   `workspaces` (owner-only UPDATE). Service-role bypasses RLS at DB level.
7. **Auth: Supabase Auth, magic link primary.** No social providers yet. Single
   shared password is GONE. Session via signed cookie, refreshed in
   `proxy.ts`.
8. **Storage paths workspace-aware:**
   `hiring-resumes/{workspace_id}/{candidate_id}/{filename}`. Storage RLS gates
   reads/writes by the first path segment.
9. **Service-role client (`getSupabaseAdmin` / `hiringAdmin()`) is opt-in.**
   No direct usage in `app/(app)/`. Allowed in scripts and `lib/auth/session.ts`
   indirectly via `hiring()` at module load (now auth-aware). Each future use
   must carry a `// SERVICE ROLE: <reason>` comment.
10. **Self-signup model:** **public, future** ("Modelo A"). Not built yet.
    First user (`emanuel@talental.mx`) was provisioned via
    `scripts/bootstrap-emanuel.ts`.
11. **No Inngest yet.** Bulk parsing (Sprint 1) will need it; not installed.
12. **Vercel:** Hobby plan. Cron jobs are NOT available (would need Pro).
    `vercel.json` no longer exists in repo (removed when Manatal cron was
    deleted).

---

## 5. Estado de cada Día / Sprint

| Phase | Status | Notes |
|---|---|---|
| Día 0 — Stabilization audit | ✅ | `AUDIT_REPORT.md` lives in root |
| Día 1 — Supabase Auth migration | ✅ | Magic link working in prod |
| Cleanup 1 — drop legacy `public.*` + lucide bump + `lib/supabase/` reorg | ✅ | |
| Cleanup 2 — `roles → jobs` rename + drop `clients` | ✅ | DB + code, single commit |
| Mini-cleanup — `role-*` filenames → `job-*` | ✅ | |
| Día 2 — RLS policies + auth-aware queries + workspace-scoped storage | ✅ | 9/9 isolation tests pass |
| Hardening sequences (post-Día 2) | ✅ | `application_events_id_seq` USAGE+SELECT to authenticated; default privileges set |
| Día 3 — storage paths workspace-aware | ✅ | merged into Día 2 (already done) |
| **Próximo: Onboarding / public signup (Modelo A)** | ❌ | not started |
| Sprint 1 — bulk CV ingest | ❌ | not started |
| Sprint 2 — search + match scoring | ❌ | |
| Sprint 3 — outreach (WhatsApp + email) | ❌ | |
| Sprint 4 — client portal + reports + billing | ❌ | |

---

## 6. Lo que está construido y funciona

- **Login** (`/login`) magic link + password fallback. Logout via signOutAction.
- **Roles list** (`/jobs`) — table with company chip, status, candidate count.
- **Job create** (`/jobs/new`) — company combobox (DB + Clearbit web suggest),
  Google Places location, comma-formatted salary inputs, public description.
  Auto-seeds 12 default pipeline stages on create.
- **Job detail** (`/jobs/[jobId]`) — kanban with `@dnd-kit`, optimistic moves,
  SSR-safe hydration shim, slide-over via `?contact={applicationId}`.
- **Candidate slide-over** — name, email, phone, LinkedIn, source, resume,
  tags, notes, activity timeline, parsed profile (experience / education /
  skills / languages).
- **Resume upload** — auto-parses with Claude on upload, fills empty candidate
  fields. Re-parse button (✨) overwrites all fields.
- **Tags** — workspace-scoped, polymorphic (`entity_tags` table), applied to
  applications, pills on cards.
- **Notes** — polymorphic (entity_type), CRUD on candidate + company surfaces.
- **Job settings** (`/jobs/[jobId]/settings`) — edit basics + AI scoring config
  + delete with title-confirm.
- **Companies list** (`/companies`) — status filter pills (Cliente / Prospecto
  / Aliado / Otra), search.
- **Company slide-over** (`/companies?company={id}`) — linked jobs, notes,
  status edit, industry/size/HQ/LinkedIn fields.
- **Activity timeline** — auto-logged on stage changes via DB trigger.
- **Multi-tenant isolation** — verified by `scripts/test-rls-isolation.ts`.
- **Storage workspace-scoping** — paths and RLS both enforce it.

---

## 7. Lo que NO está construido (roadmap conocido)

> Solo lo que ya hemos discutido. No inventes features.

- **Onboarding / public signup** ("Modelo A") — first user must run bootstrap
  script. No way for a second agency to sign up yet.
- **Bulk CV upload** (Sprint 1) — multi-file drag-drop + background parse queue.
- **Email-forwarding ingest** (Sprint 1) — alias-per-job that creates
  applications from forwarded emails.
- **Talent pool** (`/candidates`) (Sprint 1) — global candidate list with
  search across workspaces' candidates.
- **Search filters** (Sprint 2) — by skills, location, years exp, parsed_profile fields.
- **AI search natural-language** (Sprint 2) — embeddings + semantic search.
- **Match scoring per job** (Sprint 2) — score candidates against role rubric.
- **Outreach via Unipile** (Sprint 3) — LinkedIn + WhatsApp + email sequences.
- **Inbox** (Sprint 3) — unified messaging.
- **Sequences** (Sprint 3) — multi-step outreach automation. Schema is in
  place (`sequences`, `sequence_steps`, `sequence_enrollments`); no UI.
- **Client portal público** (`/jobs/[jobId]/portal`) (Sprint 3-4) — schema
  exists in `job_client_portal_settings`; tab is a stub.
- **Reportes / analytics** (`/jobs/[jobId]/reports` + workspace-level)
  (Sprint 4) — funnel, response rates, rejection reasons.
- **Stripe billing** (Sprint 4+) — schema columns exist on `workspaces`
  (`stripe_customer_id`, `stripe_subscription_id`, `plan_tier`).
- **DOCX resume support** — only PDF today; would need `mammoth` or similar.
- **Job posting / public career page** (`/jobs/[jobId]/description`) — stub.
- **Custom fields UI** — schema is in place (`custom_field_definitions`,
  `custom_field_values`); no UI to define or edit.
- **Tasks / reminders UI** — schema in place; no UI.
- **Multi-owner per job** — `job_owners` table exists; UI shows single owner.
- **Tags UI for workspace settings** — tags are created inline only.

---

## 8. Servicios externos conectados

- **Supabase** — project `ogjwwxfnjoznjwavccwn` ("Talental Client Portal" —
  legacy name in dashboard, content is now Talental ATS). Region: us-west-2.
  - Schemas: `hiring.*` (all data), `auth.*` (Supabase Auth), `storage.*`.
  - Bucket `hiring-resumes` private, 10 MB cap, PDF MIME allowlist.
  - Auth: Site URL + Redirect URLs configured for `app.talental.mx` + localhost.
- **Vercel** — `app.talental.mx` Hobby project, deployed from `main` of
  `eglvn77/talental` (GitHub).
- **Anthropic API** — `ANTHROPIC_API_KEY` in env. Resume parsing uses Haiku.
- **Google Maps Places** — `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in env (client-side,
  must be domain-restricted in GCP).
- **Clearbit** — autocomplete (no auth, free) + favicon for company logos.

### Variables de entorno (nombres únicamente)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
ANTHROPIC_API_KEY
NEXT_PUBLIC_GOOGLE_MAPS_KEY
BOOTSTRAP_EMAIL
BOOTSTRAP_NAME
```

`.env.local.example` is the source of truth. **Removed since Cleanup 1:**
`MANATAL_API_TOKEN`, `ADMIN_PASSWORD`, `CRON_SECRET`.

---

## 9. Guardrails operacionales (CRÍTICO)

> These are non-negotiable. Multiple sessions burned trust by violating these.

- **NO scope creep.** Do exactly what the prompt says, nothing more. Anything
  obvious-but-not-asked goes in a "Sugerencias para después" section, not in
  the diff.
- **NO copy / branding / language changes outside explicit scope.** Emanuel has
  decided UI is in Spanish, code in English. Don't translate code or English
  comments. Don't rebrand without asking.
- **NO RLS / auth changes without understanding why.** RLS is the multi-tenant
  spine. Test isolation after any change to `hiring.user_workspace_ids()` or
  policies — `scripts/test-rls-isolation.ts` exists for this.
- **PAUSE and ASK** if you're about to:
  - Drop a table or column with data
  - Change a public route
  - Touch the auth flow
  - Add a paid third-party
  - Take a decision not in the prompt
- **One commit per prompt.** Don't make intermediate auto-commits while
  exploring. Commit at the end with a clear message.
- **Service role usage** must carry a `// SERVICE ROLE: <reason>` comment.
  Today, app code has zero direct service-role usage; only scripts use it.
- **Next 16 specifics:** middleware → `proxy.ts`. Read
  `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` if
  unsure.
- **Don't push to main without verification.** `npm run build` must pass; if
  the change touches RLS, run `scripts/test-rls-isolation.ts`.

---

## 10. Decisiones diferidas (no decididas — no inventes)

- **Pricing exacto** (workspaces.plan_tier enum has placeholders).
- **Branding final** — "Talental" is current, not committed.
- **Marketing landing** — none exists.
- **Rate limits** for AI parsing, Clearbit, etc.
- **Refactor del bootstrap script** — currently uses its own `createClient`
  instead of `lib/supabase/admin`.
- **Bumps de dependencias menores** — done one-off when broken (lucide), not
  proactively.
- **DOCX vs PDF-only** for resume upload.
- **Custom domain per workspace** (subdomain or path-based) — TBD when first
  external customer appears.
- **Multi-region** for Supabase (us-west-2 only today).

---

## 11. Problemas conocidos

- **`lucide-react`**: stayed at `^0.577.0` deliberately. The `1.x` line on
  npm's `latest` tag dropped many icons (e.g. `Linkedin`). Don't bump to 1.x.
- **`pdf-parse@1.1.1` deep import**: imported as
  `pdf-parse/lib/pdf-parse.js` to bypass the package's `index.js` which runs a
  debug test that ENOENTs on a sample file. v2 had a worker issue with
  Turbopack. Replace with `unpdf` or `pdfreader` if this breaks again.
- **Google's legacy `Autocomplete`** in `location-autocomplete.tsx` is
  deprecated for new customers. Console warns. Migrate to
  `PlaceAutocompleteElement` when needed.
- **Clearbit autocomplete** sends every keystroke to `clearbit.com`
  unauthenticated. Privacy disclosure should appear in onboarding when
  signup is built.
- **Hydration shim in `pipeline-board.tsx`**: `useEffect(() => setMounted(true))`
  exists because `@dnd-kit` uses an incrementing counter for `aria-describedby`
  that drifts SSR↔client. Don't remove without testing.
- **`bigserial` sequences** need `GRANT USAGE` to `authenticated` for triggers
  to insert. Default privileges set; new sequences inherit. The only such
  sequence today is `application_events_id_seq`.
- **3 React 19 lint warnings** about `setState`-in-`useEffect` in
  `pipeline-board.tsx`, `company-combobox.tsx`, `location-autocomplete.tsx`.
  Patterns are intentional (mount gating, debounced query clears). Low risk.
- **Vercel Hobby plan = no crons.** Cron-based features (background reparses,
  scheduled emails) require Pro or external scheduler.
- **Bootstrap script duplicates Supabase client setup.** Works, but doesn't use
  `lib/supabase/admin.ts`.

---

## 12. Cómo arrancar la próxima sesión

For the next Claude Code session:

1. **Read this `HANDOFF.md` end to end.**
2. **Read `AGENTS.md`** — it warns that this is Next 16, not 14/15.
3. **Read `CLAUDE.md`** (just `@AGENTS.md`).
4. **Skim `AUDIT_REPORT.md`** if context permits — it has a deeper map of the
   codebase.
5. **Ask Emanuel "¿qué sigue?"** before doing anything. Don't assume.
6. **Don't fix "obvious" things proactively.** Anything that looks wrong but
   wasn't asked → "Sugerencias para después" in your next reply, not a diff.
7. **For RLS or auth changes:** run `npx --yes tsx --env-file=.env.local
   scripts/test-rls-isolation.ts` before pushing. 9/9 must pass.
8. **For new sequences in `hiring.*`:** confirm `GRANT USAGE` to authenticated
   (default privileges should cover it, but verify).
9. **Always `npm run build` before pushing.** Next 16 + Turbopack catches
   things `tsc` doesn't.
10. **Don't push to `main` without Emanuel's go-ahead unless he explicitly
    delegated push authority for that prompt.**

Memory files in `~/.claude/projects/-Users-eman-Projects-talental-clients-portal/memory/`
contain prior context (user preferences, project history). They auto-load.
