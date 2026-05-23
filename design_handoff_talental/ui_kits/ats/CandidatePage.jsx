// CandidatePage.jsx — the main "Candidates" view
function CandidatePage() {
  const [selected, setSelected] = React.useState("a1");
  const [tab, setTab] = React.useState("all");
  const [filter, setFilter] = React.useState("all");

  const counts = {
    all: ATS_CANDS.length,
    shortlist: ATS_CANDS.filter((c) => c.stage === "shortlist").length,
    screening: ATS_CANDS.filter((c) => c.stage === "screening").length,
    sourced: ATS_CANDS.filter((c) => c.stage === "sourced").length,
    sent: ATS_CANDS.filter((c) => c.stage === "sent").length,
  };

  return (
    <main className="at-content">
      <div className="at-page__head">
        <div>
          <h1 className="at-page__title">Candidates</h1>
          <div className="at-page__sub">Head of Growth · Mercury-stage fintech · 1,284 in pool · 27 active</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="at-btn at-btn--ghost"><FileText size={14} /> Brief</button>
          <button className="at-btn at-btn--ink"><Mail size={14} /> Send shortlist</button>
        </div>
      </div>

      <div className="at-tabs">
        {[
          ["all", "All", counts.all],
          ["shortlist", "Shortlist", counts.shortlist],
          ["screening", "Screening", counts.screening],
          ["sourced", "Sourced", counts.sourced],
          ["sent", "In client process", counts.sent],
        ].map(([id, label, n]) => (
          <div
            key={id}
            className={"at-tab" + (tab === id ? " is-active" : "")}
            onClick={() => setTab(id)}
          >
            {label} <span className="count">{n}</span>
          </div>
        ))}
      </div>

      <div className="at-filters">
        {["all", "ai-sourced", "latam", "currently-in-role", "available"].map((f) => (
          <span
            key={f}
            className={"at-chip" + (filter === f ? " is-active" : "")}
            onClick={() => setFilter(f)}
          >
            {f.replace("-", " ")}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--fg-muted)", textTransform: "uppercase" }}>
          SORTED BY FIT · DESC
        </span>
      </div>

      <CandidateTable selected={selected} onSelect={setSelected} />
    </main>
  );
}

Object.assign(window, { CandidatePage });
