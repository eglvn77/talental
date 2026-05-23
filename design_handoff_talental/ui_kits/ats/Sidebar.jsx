// Sidebar.jsx — ATS left navigation
function AtsSidebar({ active, onPick }) {
  const iconMap = { Inbox, Briefcase, Users, Calendar, Sparkles, FileText, User };
  return (
    <aside className="at-side">
      <div className="at-side__logo">
        <TalentalMark size={26} />
        <div>
          <div className="name">Talental</div>
          <span className="sub">ATS · v0.4</span>
        </div>
      </div>
      {ATS_NAV.map((group) => (
        <React.Fragment key={group.group}>
          <div className="at-side__group">{group.group}</div>
          <nav className="at-nav">
            {group.items.map((item) => {
              const Icon = iconMap[item.icon];
              const isActive = active === item.id || (active == null && item.active);
              return (
                <div
                  key={item.id}
                  className={"at-nav__item" + (isActive ? " is-active" : "")}
                  onClick={() => onPick(item.id)}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                  {item.count && <span className="badge">{item.count}</span>}
                </div>
              );
            })}
          </nav>
        </React.Fragment>
      ))}
      <div className="at-side__footer">
        <span className="at-side__avatar">MR</span>
        <div className="at-side__me">
          Maria Reyes
          <em>FOUNDER</em>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { AtsSidebar });
