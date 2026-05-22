# Talental Brand v1 — ATS Migration Guide

A working document for applying the new Talental brand system to the ATS (Next.js + Supabase).

## Brand system reference

### Colors

The system has two modes. Light mode is the primary working brand. Dark mode is a tactical variant used for premium moments (proposal covers, high-stakes UI states). Use light mode as default. Aim for roughly 80/20 light/dark across the product.

#### Light mode (Bone — primary)

| Token | Value | Use |
|---|---|---|
| `background` | `#EAE7DA` | Page background |
| `card` | `#F5F2E7` | Cards, sections, raised surfaces |
| `foreground` | `#1A1A1A` | Body text, primary content |
| `accent` | `#5C6F3F` | The olive dot, CTAs, active states, highlights |

#### Dark mode (Ink — variant)

| Token | Value | Use |
|---|---|---|
| `background` | `#1E1B16` | Page background |
| `card` | `#2A271F` | Cards, sections, raised surfaces |
| `foreground` | `#E8E2D0` | Body text, primary content |
| `accent` | `#A8BD70` | The olive dot (lighter for legibility), CTAs, highlights |

### Typography

- **Sans:** DM Sans. Weights 400 (regular) and 500 (medium). Used everywhere by default.
- **Mono:** DM Mono. Weight 400. Used only for metadata: timestamps, IDs, dates, technical labels, breadcrumbs.
- **Tracking guidance:** headings use slightly tight letter-spacing (-0.025em to -0.04em depending on size). Body text default.

### Components

#### Wordmark

The string "Talental" in DM Sans 500, with the period in accent color.

> Talental**.**

The period is part of the brand. Always include it in the wordmark. It is the *firma visual*.

#### Logo (symbol)

The dot alone. A filled circle in the accent color. Used as favicon, app icon, social avatar, and any context where the full wordmark would not fit or read.

For app icons and avatars: olive dot centered inside a container that uses `foreground` as the container background. The contrast creates a deliberate small mark that scales.

### Usage rules

1. The accent (olive) is the only color with voice. Use it scarcely. One accent moment per view is usually enough.
2. Never introduce a fifth color. If you feel like you need one, the design is wrong.
3. DM Mono is restricted to metadata. Never use it for body copy or headings.
4. The wordmark always includes the period. The symbol is always a single dot.
5. Dark mode is variant, not co-equal. Default to light unless there is a deliberate reason.

## Notes

- Each prompt in the migration is one commit. Resist the urge to combine.
- If a prompt requires touching more than its allowed scope, stop and reassess.
- After all 5 prompts are run, do a manual end-to-end visual QA across: login, dashboard, candidate detail, job creation, settings. Light and dark modes both.
- Keep this file updated as the brand evolves. Treat it as living documentation.
