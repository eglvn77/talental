// Nav.jsx — sticky top nav with scroll-aware hairline
function Nav() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={"tl-nav" + (scrolled ? " scrolled" : "")}>
      <div className="tl-nav__inner">
        <a className="tl-nav__logo" href="#" aria-label="Talental">
          <TalentalWordmark size={26} />
        </a>
        <div className="tl-nav__links">
          <a href="#work">Work</a>
          <a href="#approach">Approach</a>
          <a href="#manifesto">Manifesto</a>
          <a href="#contact" className="tl-nav__cta">Start a search</a>
        </div>
      </div>
    </nav>
  );
}

Object.assign(window, { Nav });
