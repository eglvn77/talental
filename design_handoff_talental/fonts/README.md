# Fonts

The system ships with **two** Google Fonts loaded via CDN — no local font files. The `@import` at the top of `colors_and_type.css` handles loading.

## Stack

| Role | Family | Source | Weights |
|---|---|---|---|
| **Sans (everything visual)** | DM Sans | Google Fonts (SIL OFL) | 400 / 500 / 600 / 700 |
| **Mono (metadata only)** | DM Mono | Google Fonts (SIL OFL) | 400 / 500 |

DM Sans is the **only** sans-serif in the system. It carries the wordmark, every heading, every UI control, every line of body. DM Mono carries metadata — status pills, table headers, eyebrows, dates, IDs.

No serif. No second sans.

## Intended (licensed) stack

Per the original brief, the design intent was **Söhne** by Klim Type Foundry. Söhne is commercial — licence at https://klim.co.nz/retail-fonts/soehne/

The free substitutes were chosen as follows:

- **Söhne → DM Sans.** Humanist sans with geometric discipline. SIL OFL, freely usable for any purpose. The personality intent: Linear, Mercury, Read.cv — restrained, modern, no character flourishes.
- **Söhne Mono → DM Mono.** Companion monospace from the same family. SIL OFL.

> If you license Söhne, drop the woff2 files into this folder and replace the `@import` block at the top of `colors_and_type.css` with `@font-face` rules. DM Sans is the substitute, not a recommendation.

## Why DM Sans, not Public Sans

A previous iteration of this system used Public Sans + Fraunces (a serif). After the user's review the system was simplified to a single sans family: DM Sans. The decision keeps the same conceptual rationale (distillation, the funnel made visible) while shifting the personality reference away from Stripe Press editorial and toward Linear / Mercury restraint. DM Sans has marginally tighter geometric forms and reads cleanly at both the wordmark display size and at body-text scale.
