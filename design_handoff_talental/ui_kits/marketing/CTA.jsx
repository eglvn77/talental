// CTA.jsx — closing CTA + footer
function CTA() {
  return (
    <section className="tl-section" id="contact">
      <div className="tl-cta">
        <div>
          <div className="tl-section__eyebrow" style={{ marginBottom: 16 }}>Start a search</div>
          <h2 className="tl-cta__title">Tell us who you need. We'll be back tomorrow.</h2>
          <p className="tl-cta__body">
            One email. We reply within 24 hours with a written plan — or we tell you we're not the right fit.
          </p>
        </div>
        <a className="tl-cta__btn" href="mailto:hi@talental.mx">
          hi@talental.mx
          <ArrowUpRight size={16} />
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="tl-footer">
      <div className="tl-footer__inner">
        <div>
          <TalentalWordmark size={32} />
          <p className="tl-footer__about">
            Founder-led, AI-native recruiting firm. Growth, marketing, and ops talent for tech companies hiring across LATAM.
          </p>
        </div>
        <div className="tl-footer__col">
          <h4>Company</h4>
          <ul>
            <li><a href="#">Approach</a></li>
            <li><a href="#">Manifesto</a></li>
            <li><a href="#">Notes</a></li>
          </ul>
        </div>
        <div className="tl-footer__col">
          <h4>For clients</h4>
          <ul>
            <li><a href="#">Start a search</a></li>
            <li><a href="#">Client portal</a></li>
            <li><a href="#">Engagement model</a></li>
          </ul>
        </div>
        <div className="tl-footer__col">
          <h4>Contact</h4>
          <ul>
            <li><a href="mailto:hi@talental.mx">hi@talental.mx</a></li>
            <li><a href="#">CDMX · LATAM</a></li>
            <li><a href="#">LinkedIn</a></li>
          </ul>
        </div>
      </div>
      <div className="tl-footer__base">
        <span>© 2025 Talental</span>
        <span>Made in Ciudad de México</span>
      </div>
    </footer>
  );
}

Object.assign(window, { CTA, Footer });
