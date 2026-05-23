// TopBar.jsx — search + global actions
function AtsTopBar() {
  return (
    <header className="at-top">
      <div className="at-search">
        <Search size={16} />
        <input placeholder="Search candidates, companies, notes…" />
        <kbd>⌘K</kbd>
      </div>
      <div className="at-top__actions">
        <button className="at-btn at-btn--ghost"><Filter size={14} /> Filters</button>
        <button className="at-btn at-btn--ghost"><FileText size={14} /> Export</button>
        <button className="at-btn at-btn--accent"><Plus size={14} /> New candidate</button>
      </div>
    </header>
  );
}

Object.assign(window, { AtsTopBar });
