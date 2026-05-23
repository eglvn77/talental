// Specialties.jsx — three-column "what we hire for"
function Specialties() {
  const specs = [
    {
      n: "01",
      title: "Growth",
      body: "The people who own the engine: acquisition, lifecycle, retention. We've placed across PLG and sales-led motions.",
      roles: "VP GROWTH · HEAD OF DEMAND · LIFECYCLE LEAD · GROWTH ENG",
    },
    {
      n: "02",
      title: "Marketing",
      body: "Founders-of-marketing through ICs. Brand, product marketing, content. Strong opinions about CMS and how to write.",
      roles: "CMO · HEAD OF BRAND · PMM LEAD · CONTENT DIRECTOR",
    },
    {
      n: "03",
      title: "Operations",
      body: "RevOps, business ops, people ops. The people who turn a founder's sketch into a system that runs without them.",
      roles: "VP OPS · CHIEF OF STAFF · REV OPS · BIZ OPS",
    },
  ];
  return (
    <section className="tl-section" id="approach">
      <div className="tl-section__head">
        <div className="tl-section__eyebrow">Three lanes. Nothing else.</div>
        <h2 className="tl-section__title">We don't hire engineers, designers, or executives. Three lanes is enough.</h2>
      </div>
      <div className="tl-specs">
        {specs.map((s) => (
          <div className="tl-spec" key={s.n}>
            <div>
              <div className="tl-spec__num">{s.n}</div>
              <div className="tl-spec__title">{s.title}</div>
              <div className="tl-spec__body">{s.body}</div>
            </div>
            <div className="tl-spec__roles">{s.roles}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { Specialties });
