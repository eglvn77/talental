// SearchList.jsx — left sidebar showing active searches
function SearchList({ active, onPick }) {
  return (
    <aside className="pt-side">
      <div className="pt-side__head">
        <h3>Active searches</h3>
        <span className="pt-side__count">{PORTAL_SEARCHES.length} OPEN</span>
      </div>
      {PORTAL_SEARCHES.map((s) => (
        <div
          key={s.id}
          className={"pt-srow" + (active === s.id ? " is-active" : "")}
          onClick={() => onPick(s.id)}
        >
          <div className="pt-srow__role">{s.role}</div>
          <div className="pt-srow__meta">{s.company.toUpperCase()}</div>
          <div className="pt-srow__progress">
            <div className="pt-srow__bar"><span style={{ width: (s.progress * 100) + "%" }} /></div>
            <span className="pt-srow__pct">{s.stage}</span>
          </div>
        </div>
      ))}
    </aside>
  );
}

Object.assign(window, { SearchList });
