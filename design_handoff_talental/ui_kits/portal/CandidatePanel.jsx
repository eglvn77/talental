// CandidatePanel.jsx — slide-in candidate detail
function CandidatePanel({ candidate, open, onClose }) {
  if (!candidate) return <div className="pt-panel" />;
  return (
    <>
      <div className={"pt-scrim" + (open ? " is-open" : "")} onClick={onClose} />
      <aside className={"pt-panel" + (open ? " is-open" : "")}>
        <button className="pt-panel__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="pt-panel__head">
          <span className="pt-panel__avatar" style={{ background: candidate.color, color: "#EFE9DB" }}>
            {candidate.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
          <div>
            <div className="pt-panel__name">{candidate.name}</div>
            <div className="pt-panel__title">{candidate.title}</div>
          </div>
        </div>
        <div className="pt-panel__chips">
          <span className="pt-chip">{candidate.loc.toUpperCase()}</span>
          <span className="pt-chip">{candidate.years.toUpperCase()} EXPERIENCE</span>
          <span className="pt-chip" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
            {"★".repeat(candidate.stars)} FIT
          </span>
        </div>

        {candidate.note && (
          <div className="pt-panel__section">
            <h4>Recruiter note</h4>
            <div className="pt-panel__note">{candidate.note}</div>
          </div>
        )}

        <div className="pt-panel__section">
          <h4>Details</h4>
          <div className="pt-panel__row"><span className="k">Currently at</span><span className="v">{candidate.title.split(" — ")[1] || "—"}</span></div>
          <div className="pt-panel__row"><span className="k">Open to</span><span className="v">Remote LATAM · CDMX</span></div>
          <div className="pt-panel__row"><span className="k">Compensation</span><span className="v">$165k OTE target</span></div>
          <div className="pt-panel__row"><span className="k">Notice period</span><span className="v">4 weeks</span></div>
          <div className="pt-panel__row" style={{ borderBottom: 0 }}><span className="k">Languages</span><span className="v">ES · EN · PT</span></div>
        </div>

        <div className="pt-panel__section">
          <h4>Why we picked them</h4>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--fg-2)", margin: 0 }}>
            Built and ran growth at two LATAM-first companies through Series A → C. Comfortable with both PLG and outbound motion. Wrote the playbook your team is currently trying to reverse-engineer.
          </p>
        </div>

        <div className="pt-panel__actions">
          <button className="pt-btn pt-btn--accent">
            <Calendar size={16} /> Schedule intro
          </button>
          <button className="pt-btn pt-btn--ghost">
            <FileText size={16} /> View CV
          </button>
          <button className="pt-btn pt-btn--ghost">
            <Linkedin size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

Object.assign(window, { CandidatePanel });
