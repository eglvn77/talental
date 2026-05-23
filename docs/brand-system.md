# Talental brand system — Distillate

> **Source of truth:** `design_handoff_talental/`. If this doc conflicts with the handoff, the handoff wins.
>
> **Direction:** Distillate. Bone canvas, deep-olive accent, ink type. One idea: many sourced, few screened, one hired.

This document is the operational guide for engineers working in this codebase. The handoff has the full rationale. This is what you do at the keyboard.

---

## Non-negotiables

These rules come from the handoff brief. Violating them produces off-brand UI even if everything technically renders.

- **One accent: olive `#5C6B3F`.** At most **one** olive moment per visible region (primary CTA, the wordmark period, a single eyebrow). Never accent the whole page.
- **Canvas is bone (`#EFE9DB`), never pure white.** Body text is ink (`#1C1B16`), never pure black.
- **No gradients.** The one documented exception is `.btn-ai` / `.btn-ai-outline`, reserved for AI-tells (Kickoff, Calibrar) and constrained to the olive family ramp. Use sparingly.
- **One sans family: DM Sans.** Body, UI, headings, displays, the wordmark. Weights 400 / 500 / 600 / 700.
- **One mono companion: DM Mono.** Metadata only — status pills, table headers, eyebrows, dates, IDs. Always uppercase, tracked +0.04em to +0.08em.
- **No serif. No second sans.**
- **Sentence case everywhere.** `Agregar vacante`, not `Agregar Vacante`. Mono metadata may be `ALL CAPS`.
- **Lucide icons only**, outline only, `stroke-width: 1.5`, `stroke="currentColor"`. The global rule in `globals.css` enforces the stroke; override per use with `strokeWidth={…}` if ever needed.
- **Borders > shadows.** Cards = hairline border, no default shadow. One tactical lift (`--shadow-lift`) for modals/menus.
- **Radii:** `6px` workhorse (`rounded-md`), `10px` cards (`rounded-[10px]`), `999px` pills only.
- **Motion:** `180ms` `cubic-bezier(0.22, 1, 0.36, 1)`. Fades + 4–8px translates. No bounce, no scale-up, no parallax.
- **Hover = color shift.** Never opacity, never size. Press = color deepens + 0.5px y-translate (`active:translate-y-px`). Never scale.
- **Focus = 2px olive ring + 2px offset** (`focus-visible:ring-2 ring-accent ring-offset-2`).
- **Banned words in copy:** `boutique`, `leverage`, `synergy`, `world-class`, `empower`, `best-in-class`, `robust`, `seamless`, `cutting-edge`, `holistic`, `revolutionary`, `game-changing`, `disruptive`, `top talent`, `we partner with you`. No emojis, no `!` in normal product copy.

---

## Tokens

All values live in `app/globals.css` and were ported verbatim from `design_handoff_talental/colors_and_type.css`. Don't invent new values. If you need one, ask first.

### Naming

Two vocabularies coexist as aliases pointing at the same value:

- **Handoff names** (canonical, used in design conversations): `--bg-1/2/3`, `--fg-1/2`, `--fg-muted`, `--border-1`, `--border-soft`, `--accent`, `--accent-press`, `--fg-on-accent`.
- **Codebase names** (used by Tailwind utility classes for back-compat): `--background`, `--card`, `--muted`, `--foreground`, `--muted-foreground`, `--border`.

Both render the same hex. Prefer handoff names in new code (`text-fg-muted` over `text-muted-foreground`).

### Surfaces (light / Bone)

| Token | Hex | Use |
|---|---|---|
| `--bg-1` | `#EFE9DB` | Page canvas |
| `--bg-2` | `#E5DDC8` | Cards, raised surfaces |
| `--bg-3` | `#DACFB3` | Subtle insets, tints |
| `--fg-1` | `#1C1B16` | Primary text |
| `--fg-2` | `#4A4639` | Secondary text |
| `--fg-muted` | `#807866` | Metadata, mono labels |
| `--fg-disabled` | `#A8A092` | Disabled text |
| `--border-1` | `#C6BCA1` | Hairlines |
| `--border-soft` | `#D5CBB0` | Card borders |
| `--accent` | `#5C6B3F` | Primary CTA, the brand moment |
| `--accent-press` | `#44512E` | Pressed state |
| `--accent-tint` | `#D7DBC1` | Pill backgrounds |
| `--fg-on-accent` | `#F4F0E2` | Text on olive surface |

### Surfaces (dark / Ink)

Activated by `<html data-theme="dark">` (set by the pre-paint script in `app/layout.tsx` reading `localStorage.tlt_theme`) or by `prefers-color-scheme: dark` when no explicit preference is stored.

| Token | Hex |
|---|---|
| `--bg-1` | `#18170F` |
| `--bg-2` | `#221F16` |
| `--bg-3` | `#2B2820` |
| `--fg-1` | `#EFE9DB` |
| `--accent` | `#9DAE7C` (olive-light) |
| `--fg-on-accent` | `#18170F` |

### Earth supports (semantic only)

| Token | Hex | Use |
|---|---|---|
| `--positive` / `-soft` | moss `#6B7A4E` / `#D7DBC1` | In-progress, on-track |
| `--warning` / `-soft` | ochre `#B8862D` / `#EDDCB7` | Screening, attention |
| `--danger` / `-soft` | wine `#8E3829` / `#EBCEC6` | Rejected, blocked |
| `--info` / `-soft` | stone `#807866` / `#DACFB3` | Neutral metadata |

Never use these for decoration. They map to status.

### Typography

Loaded via `next/font/google` in `app/layout.tsx`:

- **DM Sans** weights 400 / 500 / 600 / 700 — variable `--font-dm-sans` → Tailwind `font-sans`.
- **DM Mono** weights 400 / 500 — variable `--font-dm-mono` → Tailwind `font-mono`.

Heading tracking is set globally in `globals.css`:

- `h1` `letter-spacing: -0.025em`
- `h2` `letter-spacing: -0.02em`
- `h3` `letter-spacing: -0.015em`

Mono utility class `.font-mono` is restricted to metadata (timestamps, IDs, dates, pills, table headers). Never apply to body or headings.

### Motion

- `--dur: 180ms` — the default.
- `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`.
- `--dur-fast: 120ms`, `--dur-slow: 320ms` for explicit fast/slow cases.

### Shadows

- `--shadow-hairline` — 1px ring in `--border-1`. Use when a card sits on a bg-1 canvas and needs to read as a separate plane.
- `--shadow-card` — hairline + 8px diffused drop. Default off; opt in.
- `--shadow-lift` — the single tactical lift, for modals/menus.

Utility classes `shadow-sticky`, `shadow-dropdown`, `shadow-modal`, `shadow-overlay` deepen automatically in dark mode.

---

## Components

### `<Wordmark>` and `<Mark>`

Both live in `components/brand/`. Built from the path-based SVGs in `public/brand/svg/` — text outlined into `<path>` elements, no font dependency.

```tsx
<Wordmark size="sm | md | lg | xl" variant="default | on-ink" />
<Mark size="sm | md | lg | xl" variant="default | on-ink | bare" />
```

- Wordmark auto-picks the **flat** SVG at <32px and the **diminuendo** SVG at ≥32px per the handoff cutover rules.
- Mark = the "T." compact lockup. Use anywhere the wordmark doesn't fit: favicon, avatar, collapsed sidebar rail.
- Never lock up the Mark with the Wordmark — they're the same thing at two scales.
- Letter color follows `currentColor`; period uses `var(--accent)` so it adapts to light/dark automatically.

### `<Button>`

`components/ui/button.tsx` — cva variants.

| Variant | Use |
|---|---|
| `default` | Olive surface. The brand moment. **One per region.** |
| `ink` | Ink surface, bone text. Second-most-emphatic CTA. |
| `outline` | Hairline border on bone. Most secondary actions. |
| `ghost` | Transparent. Toolbar/icon buttons. |
| `link` | Accent text + hover underline. Inline links. |

Hover = color shift (`bg-accent-press`, never `bg-accent/90`). Press = `active:translate-y-px`. Focus = `ring-2 ring-accent ring-offset-2`.

### `<Pill>`

`components/ui/pill.tsx` — status metadata only.

```tsx
<Pill tone="neutral | accent | success | warning | danger | info" dot>
  In progress
</Pill>
```

Mono uppercase tracked +0.06em, 999px radius. Drop the inline `StatusPill` patterns in tables in favor of this primitive.

### `<Eyebrow>`

`components/ui/eyebrow.tsx` — section labels.

```tsx
<Eyebrow>Stage 02 / 04</Eyebrow>
<h3 className="text-lg font-medium">Submit to client</h3>
```

### `<Card>`

Paper surface (`bg-bg-2`), 10px radius, soft hairline border. No default shadow.

### `<Input>`

Bone background, hairline border, focus = 2px olive ring + 2px offset (matches `<Button>`). No translucent halo.

### `.btn-ai` and `.btn-ai-outline`

The single documented exception to "no gradients". Reserved for AI-tells (Kickoff, Calibrar). The ramp is constrained to the Distillate olive family — olive → moss → olive-light → moss → olive — so it stays on-brand even while shimmering.

Use sparingly. One AI button per visible region at most.

---

## Layout

- `--container-max: 1200px` — page max width (use `max-w-[1200px]` until a Tailwind alias is added).
- `--container-prose: 680px` — long-form text max width.
- Generous vertical rhythm: `--sp-16` (64px) min between sections; marketing surfaces use `--sp-24` (96px).
- Asymmetric grids over centered. Left-aligned hero copy on a 12-column grid, mono metadata column on the right.

---

## QA

`/brand-demo` renders every primitive on every surface, both palettes side-by-side. Hit it after any token / primitive change to spot drift.

Path-based logo SVGs live in `public/brand/svg/`. Originals (with on-ink variants and the OG image) live in `design_handoff_talental/assets/talental-logo-system/`.

The favicon, apple-touch icon, and OG card are served via the Next file-based metadata convention (`app/icon.svg`, `app/apple-icon.png`, `app/opengraph-image.png`).

---

## When in doubt

- **Pull from the brief, not from instinct.** If something feels under-decorated, that's the point — Distillate.
- **Ask before adding new colors, fonts, or visual textures.** The system commits to its constraints on purpose.
- **Re-ground against real product surfaces** when they exist. The handoff is an interpretation, not a tracing.
