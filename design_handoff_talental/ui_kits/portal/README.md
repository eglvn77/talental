# Client Portal — UI kit

The client-facing surface where companies see their active searches.

## Components

- **`TopBar.jsx`** — logo + breadcrumb + inbox/notifications/avatar.
- **`SearchList.jsx`** — left sidebar listing every active search with progress + stage.
- **`SearchDetail.jsx`** — main content. Stats strip + pipeline columns.
- **`Pipeline.jsx`** — Sourced → Screened → Shortlist → Sent → Hired columns.
- **`CandidatePanel.jsx`** — slide-in side panel with full candidate detail.

## Interactions

- Click any row in the left sidebar to switch active search.
- Click any candidate card to open the side panel.
- Click the scrim or the close button to dismiss the panel.

## Assumptions flagged

- The portal layout (sidebar + detail + slide-in panel) was inferred from the brief. Confirm with founders before locking in.
- "Shortlist" capped at 5 reflects the brief's "five candidates worth meeting" promise.
- Recruiter notes are rendered with a single sienna left-rule — this is the one place the brand allows a left-accent treatment, because it's a quote-style attribution, not a card decoration.
