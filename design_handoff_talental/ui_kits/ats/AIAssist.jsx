// AIAssist.jsx — right pane: AI sourcer suggestions + prompt box
function AIAssist() {
  return (
    <section className="at-ai">
      <div className="at-ai__head">
        <div className="at-ai__title"><span className="dot"></span>AI sourcer</div>
        <div className="at-ai__sub">Scanning for: Head of Growth · LATAM</div>
      </div>

      <div className="at-ai__section">
        <h4>2 new matches today</h4>
        {AI_SUGGESTIONS.map((s) => (
          <div className="at-ai__suggest" key={s.id}>
            <div className="top">
              <span className="av" style={{ background: s.color, color: "#EFE9DB" }}>
                {s.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </span>
              <div>
                <div className="name">{s.name}</div>
                <div className="sub">{s.sub}</div>
              </div>
            </div>
            <div className="why">{s.why}</div>
            <div className="actions">
              <button className="pri">Add to search</button>
              <button>Dismiss</button>
            </div>
          </div>
        ))}
      </div>

      <div className="at-ai__section">
        <h4>Quick actions</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            "Draft outreach to María Reyes Soto",
            "Summarize last 3 candidate notes",
            "Compare top 5 fits side by side",
            "Find similar to Felipe Quiroga",
          ].map((a) => (
            <div key={a} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-1)", border: "1px solid var(--border-soft)", borderRadius: 6, fontSize: 12, color: "var(--fg-2)", cursor: "pointer" }}>
              <Sparkles size={12} />
              {a}
            </div>
          ))}
        </div>
      </div>

      <div className="at-ai__input">
        <div className="at-ai__input-box">
          <textarea rows="2" placeholder="Ask the sourcer anything…" defaultValue="Find me 5 more like María, but currently in role."></textarea>
          <div className="at-ai__input-row">
            <span className="at-ai__hint">⌘ ↵ to send</span>
            <button className="at-btn at-btn--ink"><Sparkles size={12} /> Run</button>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { AIAssist });
