// Pipeline.jsx — stage columns with candidate cards
function Pipeline({ searchId, onPickCandidate, openCandidate }) {
  const cands = PORTAL_CANDIDATES[searchId] || {};
  return (
    <div className="pt-pipe">
      {PORTAL_STAGES.map((stage) => {
        const list = cands[stage] || [];
        return (
          <div className="pt-col" key={stage}>
            <div className="pt-col__head">
              <div className="pt-col__name">
                <span className="pt-col__dot" style={{ background: PIPELINE_COLORS[stage] }} />
                {stage}
              </div>
              <span className="pt-col__count">{list.length}</span>
            </div>
            {list.map((c) => (
              <div
                key={c.id}
                className={"pt-cc" + (openCandidate === c.id ? " is-open" : "")}
                onClick={() => onPickCandidate(c)}
              >
                <div className="pt-cc__top">
                  <span className="pt-cc__av" style={{ background: c.color, color: "#EFE9DB" }}>
                    {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                  <div>
                    <div className="pt-cc__name">{c.name}</div>
                    <div className="pt-cc__title">{c.title}</div>
                  </div>
                </div>
                <div className="pt-cc__meta">
                  <span>{c.loc.toUpperCase()} · {c.years.toUpperCase()}</span>
                  <span className="pt-cc__stars">{"★".repeat(c.stars)}</span>
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase", padding: "12px 4px" }}>
                Empty
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const PIPELINE_COLORS = {
  Sourced: "#807866",
  Screened: "#B8862D",
  Shortlist: "#5C6B3F",
  Sent: "#6B7A4E",
  Hired: "#1C1B16",
};

Object.assign(window, { Pipeline, PIPELINE_COLORS });
