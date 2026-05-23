// TopBar.jsx — portal top navigation
function PortalTopBar({ search }) {
  return (
    <header className="pt-top">
      <div className="pt-top__l">
        <a className="pt-top__logo" href="#" aria-label="Talental">
          <TalentalWordmark size={22} />
        </a>
        <div className="pt-top__bread">
          <span>MERCURY · CLIENT PORTAL</span>
          <ChevronRight size={12} />
          <strong>{search ? search.role : "Searches"}</strong>
        </div>
      </div>
      <div className="pt-top__r">
        <button className="pt-top__icon" title="Inbox"><Inbox size={18} /></button>
        <button className="pt-top__icon" title="Notifications"><Bell size={18} /></button>
        <span className="pt-top__avatar">JM</span>
      </div>
    </header>
  );
}

Object.assign(window, { PortalTopBar });
