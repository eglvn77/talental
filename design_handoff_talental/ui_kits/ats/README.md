# ATS — UI kit

Internal recruiter tool. The dense, working surface. AI-native by default: the right pane is always available, suggesting candidates and drafting outreach.

## Components

- **`Sidebar.jsx`** — left nav (Workspace, Sourcing). Mark-style logo at top, user at bottom.
- **`TopBar.jsx`** — global search + filter/export/new-candidate actions.
- **`CandidateTable.jsx`** — dense triage table with fit score, stage pill, source marker (AI-sourced shows the sienna sparkle).
- **`AIAssist.jsx`** — right pane: AI sourcer suggestions, quick actions, prompt box.
- **`CandidatePage.jsx`** — the orchestrating view: title + tabs + filter chips + table.

## Interactions

- Click any sidebar item to switch nav (visual only in this kit).
- Click a candidate row to select it.
- Click a tab or filter chip to toggle active state.

## Notes

- The "AI sourcer" pane is the brand's distinguishing UI surface. Sienna is reserved for the sparkle glyph + the high-fit score, both clear signals of AI provenance.
- Fit score color tier: 90+ sienna, 80–89 olive, 70–79 ochre, below 70 stone.
