// Cases.jsx — recent placements table
function Cases() {
  const rows = [
    { co: "MERCURY-STAGE FINTECH", role: "Head of Growth", note: "Series B · US/MX", time: "11 DAYS" },
    { co: "STRIPE PORTFOLIO CO", role: "VP Marketing", note: "Seed → Series A · Remote LATAM", time: "14 DAYS" },
    { co: "B2B SAAS · SP", role: "Chief of Staff", note: "Series A · São Paulo", time: "8 DAYS" },
    { co: "MARKETPLACE · CDMX", role: "Director of Operations", note: "Series B · CDMX", time: "16 DAYS" },
    { co: "CONSUMER FINTECH", role: "Head of Lifecycle", note: "Series A · Bogotá", time: "12 DAYS" },
  ];
  return (
    <section className="tl-section" id="work">
      <div className="tl-section__head">
        <div className="tl-section__eyebrow">Recent placements · 2025</div>
        <h2 className="tl-section__title">Searches we closed. People still in role.</h2>
      </div>
      <div className="tl-cases">
        {rows.map((r, i) => (
          <div className="tl-case" key={i}>
            <div className="tl-case__co">{r.co}</div>
            <div className="tl-case__role">
              {r.role}
              <span>{r.note}</span>
            </div>
            <div className="tl-case__time">{r.time} to shortlist</div>
            <div className="tl-case__arrow"><ArrowRight size={20} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { Cases });
