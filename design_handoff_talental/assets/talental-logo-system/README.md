# Talental — Logo system (path-based exports)

All SVGs in this bundle are **text-as-paths**. The DM Sans glyphs have been
outlined into <path> elements, so the files have **zero font dependencies**.
Open them in Figma, Illustrator, PowerPoint, any browser — they will render
identically because there's no font to substitute.

## Files

- `svg/` — wordmark + T. variants (transparent + on-ink versions)
- `png/` — same assets rasterized at common widths
- `favicons/` — favicon SVG + 16/32/64 PNG + apple-touch-icon (180)
- `README.md` — this file

## Cutover rules

- **Wordmark Diminuendo** (`talental-wordmark.svg`) — use at ≥32px display height
- **Wordmark Flat** (`talental-wordmark-flat.svg`) — use for <32px (small UI, email sig)
- **T. mark** (`talental-t.svg`) — favicon, avatar, app icon, compact rail
- **Never lock up T. with the wordmark** — they're the same thing at two scales

## Colors

- Letters on bone: `#1C1B16` ink letters + `#5C6B3F` olive dot
- Letters on ink: `#EFE9DB` bone letters + `#9DAE7C` olive-light dot
- Never recolor the letters. Never place over photography.

## Favicons (HTML)

```html
<link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16.png">
<link rel="apple-touch-icon" href="/favicons/apple-touch-icon.png">
```

## Font

DM Sans by Colophon Foundry · OFL 1.1
Outlines generated via opentype.js from the static instances served by Google Fonts.
