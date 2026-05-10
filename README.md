# Talental ATS

Sistema multi-tenant de Applicant Tracking para agencias de reclutamiento.

## Stack

- Next.js 16 (App Router) + TypeScript
- Supabase (Postgres + Auth + Storage)
- Tailwind v4 + shadcn-style components
- Anthropic Claude API (resume parsing, AI scoring)
- Deployed on Vercel at `app.talental.mx`

## Setup

1. Clona el repo
2. `npm install`
3. Copia `.env.local.example` a `.env.local` y rellena las vars
4. Bootstrap del primer user:
   `npx --yes tsx --env-file=.env.local scripts/bootstrap-emanuel.ts`
5. `npm run dev`

## Estructura

- `app/(app)/` — superficie autenticada del ATS
- `app/login/` — auth pages
- `app/auth/callback/` — Supabase Auth callback
- `lib/` — auth, supabase clients, business logic
- `components/ui/` — shadcn-style primitives compartidos
