# Claude Code — Talental brand handoff

You are implementing the **Talental** brand inside the user's existing software codebase. This folder is the **source of truth** for visual identity, voice, and component patterns. Read it before touching any UI.

> Talental is a founder-led, AI-native recruiting firm placing Growth, Marketing, and Ops talent at tech companies hiring across LATAM.
> **Direction: Distillate.** Bone canvas, deep-olive accent, ink type. One idea: many sourced, few screened, one hired.

---

## What this package is — and isn't

- **Is:** brand tokens (colors, type, spacing, radii, shadows, motion), logo assets, voice rules, and HTML/JSX **reference prototypes** showing intended look-and-feel.
- **Isn't:** production code to copy verbatim. The `ui_kits/` files are design references built in plain HTML + JSX-via-Babel. **Re-implement them in the user's target framework** (React, Vue, Svelte, SwiftUI, etc.) following that codebase's existing patterns, component library, and state conventions.

If the user has no framework chosen yet, ask them. Don't assume.

---

## How to use this folder

1. **Start with `README.md`** — full brand context, voice rules, visual foundations.
2. **Pull tokens from `colors_and_type.css`** — every color, font, spacing value, radius, shadow, and motion curve lives here. Map these into the target codebase's token system (Tailwind theme, CSS variables, design-token JSON, SwiftUI Color extensions — whatever it uses). Don't re-invent values.
3. **Use `assets/` for the logo.** SVGs only. Light and dark variants included. Favicon included.
4. **Fonts** are Google Fonts (DM Sans + DM Mono). Load via the `@import` already in `colors_and_type.css`, or via the framework's preferred font-loading path (e.g. `next/font`, `@fontsource`). See `fonts/README.md` for the licensed-Söhne fallback plan.
5. **Reference `ui_kits/`** for layout, density, and component composition — three surfaces are mocked: `marketing/`, `portal/` (client portal), `ats/` (internal recruiter tool). Match their structure, not their literal markup.

---

## Non-negotiables — read these before writing CSS

These rules come from the brand brief. Violating them produces off-brand UI even if everything technically renders.

### Color
- **One accent: olive `#5C6B3F`.** Rule of one — at most one olive moment per visible region (primary CTA, the wordmark period, a single eyebrow). Never accent the whole page.
- **Canvas is bone `#EFE9DB`, never pure white.** Body text is ink `#1C1B16`, never pure black.
- **No gradients.** No multi-color systems. Earth supports (moss/ochre/wine) are semantic only (success/warning/danger), used sparingly.

### Type
- **One sans family: DM Sans.** It carries body, UI, headings, displays, the wordmark. Weights 400/500/600/700.
- **One mono companion: DM Mono.** Metadata only — status pills, table headers, eyebrows, dates, IDs, code. Always uppercase, tracked `+0.04em` to `+0.08em`.
- **No serif. No second sans.**
- **Sentence case everywhere.** `New search`, not `New Search`. Mono metadata may be `ALL CAPS`.
- **Display emphasis is a color shift (olive) or weight bump — never italic.**

### Logo
- **Wordmark:** "Talental" in DM Sans 500 with **an olive period** after the final "l". The period is the brand soul.
- **Mark:** three descending horizontal rules (72 / 44 / 18px largest). Many sourced → few screened → one hired.
- Both are pre-rendered in `assets/` and exist as React components in `ui_kits/_shared/Wordmark.jsx` — port the component into the target codebase.

### Voice
- **Distill, don't accumulate.** Cut sentences in half. Then cut them again.
- "We" for Talental. "You" for the client. Never "the firm" or "the platform".
- **Banned words:** boutique, leverage, synergy, world-class, empower, best-in-class, robust, seamless, cutting-edge, holistic, revolutionary, game-changing, disruptive, "top talent", "we partner with you".
- **No emojis** in product UI. **No exclamation marks** in normal copy.

### Iconography
- **Lucide only.** `stroke-width: 1.5`, `stroke="currentColor"`, outline only — never fill. No icon fonts, no emoji-as-icons, no unicode arrows.

### Surfaces and shadows
- Borders > shadows. Cards use 1px hairlines in `--border-soft`. One tactical lift (`--shadow-lift`) for modals/menus. That's it.
- Radii are restrained: `6px` workhorse, `10px` cards, `999px` only for status pills.

### Motion
- `180ms`, `cubic-bezier(0.22, 1, 0.36, 1)`. Fades and 4–8px translates. **No bounce, no scale-up entrances, no parallax.**

### Hover/press/focus
- Hover = color shift, not size or opacity. Never `opacity: 0.5` on hover.
- Press = color deepens + 0.5px y-translate. Never scale.
- Focus = 2px olive ring with 2px offset.

---

## Token mapping cheatsheet

When porting `colors_and_type.css` into the target codebase, preserve these semantic names — downstream code reads them:

| Semantic | Value | Use |
|---|---|---|
| `--bg-1` | `#EFE9DB` bone | page canvas |
| `--bg-2` | `#E5DDC8` paper | cards, raised surfaces |
| `--bg-3` | `#DACFB3` tint | subtle insets |
| `--fg-1` | `#1C1B16` ink | primary text |
| `--fg-2` | `#4A4639` | secondary text |
| `--fg-muted` | `#807866` stone | metadata |
| `--accent` | `#5C6B3F` olive | primary CTA, brand moment |
| `--accent-press` | `#44512E` | pressed state |
| `--border-1` | `#C6BCA1` rule | hairlines |
| `--success` / `--warning` / `--danger` | moss / ochre / wine | semantic only |

Spacing scale is 4px-based (`--sp-1` … `--sp-32`). Radii: `--r-sm: 6px`, `--r-md: 10px`. Full list in `colors_and_type.css`.

Dark mode tokens are included — port them as a `[data-theme="dark"]` (or framework equivalent) selector.

---

## Suggested implementation order

1. **Tokens first.** Port `colors_and_type.css` into the codebase's theme system. Verify a button rendered with `background: var(--accent); color: var(--fg-on-accent)` looks right.
2. **Typography next.** Load DM Sans + DM Mono, set base body styles, build a heading scale matching `--t-h1 … --t-h4`.
3. **Logo.** Drop `assets/logo-wordmark.svg` and `assets/logo-mark.svg` into the asset pipeline. Build a `<Wordmark>` and `<Mark>` component matching `ui_kits/_shared/Wordmark.jsx`.
4. **Core primitives.** Button, Input, Card, Pill (status), Eyebrow, Table — model after the patterns in `ui_kits/marketing/`, `ui_kits/portal/`, and `ui_kits/ats/`.
5. **Screens.** Re-implement screens using the codebase's routing/state conventions, modelling layout density and copy tone on the kits.

---

## Files in this folder

- `CLAUDE.md` — this file. Read first.
- `README.md` — long-form brand context (voice, foundations, iconography, caveats).
- `colors_and_type.css` — all tokens.
- `assets/` — SVG logos (wordmark, mark, dark variants, favicon).
- `fonts/README.md` — font stack notes and Söhne licensing path.
- `ui_kits/_shared/` — Wordmark + Icons components (reference React/JSX).
- `ui_kits/marketing/` — public site reference.
- `ui_kits/portal/` — client portal reference.
- `ui_kits/ats/` — internal ATS reference.

---

## When in doubt

- **Pull from the brief, not from instinct.** If something feels under-decorated, that's the point — Distillate.
- **Ask the user before adding new colors, new fonts, or new visual textures.** The system commits to its constraints on purpose.
- **Re-ground against real product surfaces** if they exist. This kit was built from a written brief without prior Figma or codebase — it's an interpretation, not a tracing.
