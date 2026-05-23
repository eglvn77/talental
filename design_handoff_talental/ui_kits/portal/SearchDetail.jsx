// SearchDetail.jsx — main content area showing one search
function SearchDetail({ search, onPickCandidate, openCandidate }) {
  if (!search) return null;
  return (
    <main className="pt-detail">
      <div className="pt-detail__head">
        <div>
          <div className="pt-section__eyebrow" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: 10 }}>
            Search · {search.id.toUpperCase()} · Started {search.started.toUpperCase()}
          </div>
          <h1 className="pt-detail__title">{search.role}</h1>
          <div className="pt-detail__sub">
            <span>{search.company.toUpperCase()}</span>
            <span>{search.location.toUpperCase()}</span>
            <span>{search.salary}</span>
          </div>
        </div>
        <div className="pt-detail__cta">
          <button className="pt-btn pt-btn--ghost"><FileText size={16} /> Brief</button>
          <button className="pt-btn pt-btn--ghost"><Mail size={16} /> Message Maria</button>
          <button className="pt-btn pt-btn--accent"><Plus size={16} /> Add note</button>
        </div>
      </div>

      <div className="pt-stats">
        <div className="pt-stat"><div className="k">Sourced</div><div className="v">{search.sourced}</div></div>
        <div className="pt-stat"><div className="k">Screened</div><div className="v">{search.screened}</div></div>
        <div className="pt-stat"><div className="k">Shortlist</div><div className="v">{search.shortlist}<em>/ 5</em></div></div>
        <div className="pt-stat"><div className="k">In client process</div><div className="v">{search.sent}</div></div>
      </div>

      <Pipeline searchId={search.id} onPickCandidate={onPickCandidate} openCandidate={openCandidate} />
    </main>
  );
}

Object.assign(window, { SearchDetail });
