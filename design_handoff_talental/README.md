# Talental — Design System

Founder-led, AI-native recruiting firm placing Growth, Marketing, and Ops talent at tech companies hiring across LATAM. This system covers the **marketing website**, the **client portal** (active searches), and the **in-house ATS**.

> Most recruiting adds complexity when it should remove it.
> Talental does the opposite.

The direction is **Distillate**: bone canvas, deep-olive accent, ink type with serif moments. The whole system commits to one idea — **many sourced, few screened, one hired**.

This repository is the visual + verbal source of truth. Pull from `colors_and_type.css`, copy UI fragments out of `ui_kits/`, follow the rules below.

---

## Sources

Built from a written brand brief (see the project conversation). No prior codebase, Figma, or product was attached — the visual direction is an original interpretation. When real product surfaces exist, re-ground against them.

Brief covers: company description, brand essence, personality, anti-references, taglines, manifesto, voice principles. The three product surfaces (marketing site, client portal, ATS) are listed in the brief but not specified in detail; this system makes reasonable assumptions and flags them in each UI kit's README.

---

## Index

Root files:
- `README.md` — this file.
- `SKILL.md` — Agent Skill manifest.
- `colors_and_type.css` — every foundational token.
- `brand-directions.html` — the chooser canvas showing all three explored directions (A · Distillate was chosen).

Folders:
- `assets/` — wordmark, mark, dark variants, favicon. All SVG.
- `fonts/` — font notes. No font files shipped — Google Fonts via CDN.
- `preview/` — design-system cards for the Design System tab.
- `ui_kits/marketing/` — public website.
- `ui_kits/portal/` — client portal for active searches.
- `ui_kits/ats/` — internal recruiter tool with AI sourcer pane.
- `ui_kits/_shared/` — `Icons.jsx` + `Wordmark.jsx` shared across kits.

---

## Brand Essence

Talental removes complexity. The Practical Sage: smart but not pedantic, direct but not curt, tech-aware without shouting tech. Editorial. Restrained. Confident without arrogance.

The whole system is built around one idea: **distill, don't accumulate**.

---

## Logo system

**Wordmark.** "Talental" set in DM Sans 500 with one chromatic moment: a deep-olive period after the final "l". The period is the brand soul — editorial finality, the close of a sentence. The wordmark and the mark are sibling gestures, not literal echoes; the period is kept as a period for elegance, not redrawn as a square. Sentence case always (capital T, the rest lowercase). Never set in another face, never centered. Tracking tightens with size: -0.025em at body, -0.03em at sub-display, -0.04em at display.

**Mark.** Three descending horizontal rules — 72 / 44 / 18px at the largest. Conceptual rationale: many candidates sourced → few screened → one hired. The engagement, distilled. Works at favicon scale (compresses to 20/12/5px stripes), survives mono/two-color reproduction, and reads as a section separator in long-form writing.

Both rendered as React components in `ui_kits/_shared/Wordmark.jsx` (`<TalentalWordmark>` and `<TalentalMark>`). SVG snapshots in `assets/`.

---

## Content Fundamentals

How copy is written. Follow these rules in every interface, email, and deck.

### Voice rules (from the brief)

1. **Distill, don't accumulate.** Cut sentences in half. Then cut them again.
2. **Speak like a person, not a firm.** "We", not "Talental"; "you", not "the client".
3. **Direct without being curt.** Confidence reads as warmth when the writing is clear.
4. **Don't promise what you don't deliver.** No "best-in-class", no "world-class".
5. **Tech-aware without shouting tech.** "AI-native" is fine. "Leveraging GPT-powered LLM workflows to…" is not.

### Casing

- **Sentence case** for everything: headings, buttons, nav, table columns. Never title case.
  - ✅ `New search`, `Active candidates`, `Send to client`
  - ❌ `New Search`, `Active Candidates`, `Send to Client`
- **All-caps only in mono metadata**: section eyebrows, status pills, table column labels. Tracked +0.06em.
  - ✅ `IN PROGRESS`, `LATAM · REMOTE`, `STAGE 02 / 04`
- **Brand name capitalization:** always **Talental** with a capital T in prose. The wordmark is set in a serif and styled — but the word itself is sentence-cased, never lowercase.

### Sentence shapes

| Use this | Don't use this |
|---|---|
| "Founder-led. AI-native. No fluff." | "We pride ourselves on a founder-led, AI-native approach with no unnecessary fluff." |
| "Five candidates. All worth meeting." | "We curate a tailored shortlist of high-calibre candidates." |
| "We hire growth, marketing, and ops people for tech companies in LATAM." | "We are a boutique talent partner specializing in transformative GTM hires." |
| "Done in three weeks." | "Typical engagement cycles run 21 business days." |

### Banned words and phrases

- **boutique** — explicitly off-brand
- **leverage, synergy, world-class, empower, best-in-class, robust, seamless, cutting-edge, holistic**
- "**top talent**" — everyone says it; means nothing
- "**we partner with you**" — say what you actually do
- **revolutionary, game-changing, disruptive**
- **Emojis** in marketing copy. (Mono pills and Lucide icons handle status.)

### I vs we vs you

- **"We"** for Talental.
- **"You"** for the client/reader. Always.
- **"They" / "the candidate"** for candidates. Never "talent" as a noun for a person.

### Numbers and metadata

- Numerals: `5 candidates`, not `five candidates`.
- Counts in mono: `02 / 04`, `+34`, `3w`.
- Dates editorial: `Mar 14`, `Q2 2025`.
- Currency: `$120k`, not `$120,000`.

### Tone examples

**Hero punch** — `Founder-led. AI-native. No fluff.`
**Subtitle** — `Growth, marketing, and ops talent for tech companies hiring across LATAM.`
**Empty state** — `No active searches yet. Start one.`
**Confirmation** — `Sent to Maria. She'll see it next time she opens the portal.`
**Error** — `That email bounced. Try another.`
**Status** — `IN REVIEW · 4 / 12`

Short, declarative, no apology, no exclamation marks. Periods do the work.

---

## Visual Foundations

### Palette

One canvas. One ink. One accent. Earth supports used semantically.

- **Bone (`#EFE9DB`)** — page canvas. Never pure white. Warm linen undertone.
- **Paper (`#E5DDC8`)** — raised surfaces, cards.
- **Ink (`#1C1B16`)** — primary text and dark surfaces. Near-black with warmth, never `#000`.
- **Olive (`#5C6B3F`)** — the single accent. Drawn from mineral soil; the period in the wordmark; primary CTA; the mark. **Rule of one:** at most one olive moment per visible region.
- **Stone (`#807866`)** — muted text, metadata.
- **Moss / Ochre / Wine** — semantic only (in-progress / warning / danger). They live in the earth family; they don't shout.

### Type

Two families, each with a job:

- **DM Sans** (Söhne substitute) — humanist sans with geometric discipline. **The only sans in the system.** Body, UI controls, buttons, table columns, headlines, displays, the wordmark. Weights 400 / 500 / 600 / 700. The personality reference is Linear, Mercury, Read.cv — restrained, modern, no character flourishes.
- **DM Mono** — metadata only. Status pills, table headers, eyebrows, dates, IDs, code. Always uppercase, tracked +0.04 to +0.08em. Weights 400 / 500.

No serif. No second sans. The system commits to one type family doing all the visual work, with mono as the metadata companion.

Display sizes use `clamp(48px, 6vw, 88px)` with `letter-spacing: -0.035em`. Body 16px / 1.55. Mono labels 11–12px.

**Headings are sentence-cased.** Display emphasis is delivered by color shift (olive) and/or weight, not italic.

### Backgrounds

- **Default:** flat `--bg-1` bone. No gradients, no textures, no decoration.
- **Section breaks:** swap to `--tl-ink` (dark) or `--tl-paper` (warmer). The change is meaningful — it marks a different surface, not a designer's mood.
- **No** full-bleed photography on marketing hero. The hero is set in type.
- **No** repeating SVG patterns, no grain, no illustrated scenes.

### Imagery

When photography is used (rarely; case studies):
- Warm-toned, natural light. Mexican modernist architecture, paper documents, hands-on-keyboard close-ups.
- No stock handshakes. No diverse-team-around-laptop tropes.
- B&W or warm desaturated. Never punchy saturation.
- One image per section, large, with mono caption underneath.

### Borders, radii, shadows

- **Radii**: subtle. `--r-sm: 6px` is the workhorse. `--r-md: 10px` for cards. Pills `999px` for status only.
- **Borders**: 1px hairlines in `--border-1`. Used liberally — we prefer borders over float.
- **Shadows**: almost never. One tactical lift (`--shadow-lift`) for modals/menus. Cards use `--shadow-card` — a hairline plus a barely-there drop. Anything else is too much.

### Hover & press

- **Hover:** color shift, not size. Links go from `--fg-1` underline-on-rule to `--accent` underline-on-accent. Buttons darken to `--accent-press`. **No** opacity-50 hover.
- **Press:** color deepens, plus a 0.5px y-translate. Barely perceptible. Never scale.
- **Focus:** 2px ring in `--accent` with 2px offset on `--bg-1`. Visible, not glowing.
- **Disabled:** `--fg-disabled` text, `--bg-3` fill. Cursor `not-allowed`.

### Motion

Restrained. `--dur: 180ms`, `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`. Fades and 4–8px translates. No bounce, no scale-up entrances, no parallax.

### Layout rules

- Max content width `1200px`. Prose max `680px`.
- Generous vertical rhythm: `--sp-16` (64px) min between sections, `--sp-24` (96px) on marketing.
- **Asymmetric grids** over centered. Hero copy left-aligns on a 12-column grid, mono metadata column at right.
- Sticky header gets a hairline bottom border once scrolled. No drop shadow.

### Transparency and blur

- Used only on the scrolled-page navbar: `backdrop-filter: blur(14px) saturate(150%)` over `rgba(239, 233, 219, 0.82)`.
- Never on cards. Never decoratively.

### Cards

- Background: `--bg-2` (paper).
- Border: 1px `--border-soft`.
- Radius: `--r-md` (10px).
- Padding: `--sp-6` (24px) minimum.
- Shadow: `--shadow-card`, often omitted entirely — the border carries the weight.

### Color of imagery

Warm. Slightly desaturated. Architectural over portraiture. Hands and screens, not faces.

---

## Iconography

**Library:** [Lucide](https://lucide.dev). Inline SVGs via the shared `Icons.jsx` component, or pulled fresh from lucide.dev.

```html
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="1.5"
     stroke-linecap="round" stroke-linejoin="round">
  <!-- path data -->
</svg>
```

**Rules:**
- Stroke weight `1.5px` (Lucide default is 2; we go lighter — matches the editorial weight of Public Sans and Fraunces).
- `stroke="currentColor"` always.
- Sizes: `16px` (inline w/ body), `20px` (UI controls), `24px` (section heads), `40px+` (rare, marketing).
- **Never fill an icon.** Outline only.
- **No emoji** in product UI.
- **No unicode hacks** as icons (✓, →) — use Lucide `check`, `arrow-right`.
- **No icon fonts.**

If you need an icon Lucide doesn't have, ask. Custom icons must read at 16px, single-pass stroke, native to Lucide.

---

## Quick start

```html
<link rel="stylesheet" href="../colors_and_type.css">
```

Headings, body, code, and links render correctly without classes. Use `.display` for the serif Fraunces hero specimens. Use `.eyebrow` / `.meta` for mono labels. Copy components from `ui_kits/<surface>/`.

---

## Caveats

- **No real product code or Figma was attached.** Everything is an interpretation of the brief. Re-ground when real surfaces exist.
- **Söhne is substituted with DM Sans** (Google Fonts, SIL OFL). Söhne Mono → DM Mono. The system uses one sans family + one mono companion — no serif.
- **No photography ships in this kit.** Hero areas use type-only or geometric blocks. Add real case-study imagery later, warm-toned and architectural per the rules above.
- **Manifesto and tone examples** are from the brief. Keep updated as the brand voice evolves.
