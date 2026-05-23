// Manifesto.jsx — dark section, full Fraunces serif treatment
function Manifesto() {
  return (
    <section className="tl-section tl-section--dark" id="manifesto">
      <div className="tl-section__inner">
        <div className="tl-manifesto">
          <p>Most recruiting adds complexity when it should remove it.</p>
          <p style={{ color: "rgba(239,233,219,0.55)" }}>
            Too many candidates. Too many meetings. Too many words.
          </p>
          <p>
            Talental does the opposite. We work on growth, marketing, and ops talent for tech companies hiring across LATAM. We deliver the candidates who <em>actually fit</em>, not a long list to make the work look bigger.
          </p>
          <p>
            <em>Founder-led. AI-native. No fluff.</em>
          </p>
          <div className="tl-manifesto__sign">— Maria Reyes · Founder · CDMX</div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Manifesto });
