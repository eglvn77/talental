// Hero.jsx — editorial serif display, mono eyebrow, asymmetric stats grid
function Hero() {
  return (
    <section className="tl-hero">
      <div className="tl-hero__eyebrow">Founder-led · AI-native · LATAM</div>
      <h1 className="tl-hero__display">
        Growth, marketing, and ops talent for tech companies hiring across LATAM.
      </h1>
      <p className="tl-hero__sub">
        Five candidates worth meeting — not a long list to make the work look bigger. <em>Said once, done right.</em>
      </p>
      <div className="tl-hero__cta-row">
        <a className="tl-hero__cta" href="#contact">
          Start a search
          <ArrowRight size={16} />
        </a>
        <a className="tl-hero__cta-ghost" href="#work">See recent placements →</a>
      </div>
      <div className="tl-hero__meta">
        <div className="tl-hero__meta-item">
          <div className="k">Days to shortlist</div>
          <div className="v">9</div>
          <div className="n">Median across active engagements, 2025.</div>
        </div>
        <div className="tl-hero__meta-item">
          <div className="k">Per shortlist</div>
          <div className="v">3—5</div>
          <div className="n">All worth meeting. None for show.</div>
        </div>
        <div className="tl-hero__meta-item">
          <div className="k">Hired from shortlist</div>
          <div className="v">82%</div>
          <div className="n">Last 24 engagements. 19 still in role.</div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Hero });
