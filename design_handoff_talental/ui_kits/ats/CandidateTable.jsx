// CandidateTable.jsx — dense triage table
function StagePill({ stage }) {
  const map = {
    sourced: "Sourced", screening: "Screening", shortlist: "Shortlist",
    sent: "Sent", passed: "Passed",
  };
  return <span className={"at-pill at-pill--" + stage}>{map[stage]}</span>;
}

function ScoreBar({ score }) {
  const color = score >= 90 ? "var(--accent)" : score >= 80 ? "#6B7A4E" : score >= 70 ? "#B8862D" : "var(--fg-muted)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="at-score" style={{ color }}>{score}</span>
      <div style={{ width: 36, height: 4, background: "var(--bg-3)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: score + "%", height: "100%", background: color }} />
      </div>
    </div>
  );
}

function CandidateTable({ selected, onSelect }) {
  return (
    <div className="at-table">
      <div className="at-thead">
        <span></span>
        <span>Candidate</span>
        <span>Location</span>
        <span>Fit</span>
        <span>Stage</span>
        <span>Source</span>
        <span style={{ justifySelf: "end" }}>Actions</span>
      </div>
      {ATS_CANDS.map((c) => (
        <div
          key={c.id}
          className={"at-trow" + (selected === c.id ? " is-selected" : "")}
          onClick={() => onSelect(c.id)}
        >
          <span className="at-trow__check">{selected === c.id && <Check size={11} />}</span>
          <div className="at-trow__person">
            <span className="at-trow__av" style={{ background: c.color, color: "#EFE9DB" }}>
              {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <div>
              <div className="at-trow__name">{c.name}</div>
              <div className="at-trow__title">{c.title}</div>
            </div>
          </div>
          <div className="at-trow__loc">{c.loc.toUpperCase()}</div>
          <ScoreBar score={c.score} />
          <StagePill stage={c.stage} />
          <span className={"at-trow__source" + (c.source === "ai" ? " ai" : "")}>
            {c.source === "ai" && "✦ "}{c.source.toUpperCase()}
          </span>
          <div className="at-trow__actions">
            <button className="at-icon-btn" title="Message"><Mail size={14} /></button>
            <button className="at-icon-btn" title="Schedule"><Calendar size={14} /></button>
            <button className="at-icon-btn" title="More"><MoreH size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { CandidateTable, StagePill, ScoreBar });
