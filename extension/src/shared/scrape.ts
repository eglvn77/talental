import type { ScrapedProfile } from "./api";

/**
 * Best-effort DOM scrape of the LinkedIn /in/<slug> page the user
 * is currently viewing. ZERO scraping risk because:
 *   - The page is already loaded in the user's browser. We don't
 *     navigate, don't request anything from LinkedIn, don't trigger
 *     any additional pageview. We just read what's rendered.
 *   - This only fires on explicit "Add" click — no background
 *     scraping, no automation pattern.
 *
 * LinkedIn's class names are obfuscated and rotate; we rely on
 * stable signals where possible:
 *   - Name: <h1> inside the profile header is consistent
 *   - Headline: the `.text-body-medium` div near the name
 *   - Location: section labeled "Location" or the small text under
 *     the headline that contains a city
 *   - About: section with id starting "about"
 *   - Experience: ordered list under #experience
 * For each field we try multiple selectors and bail to null if
 * everything fails. The backend already accepts any subset.
 */

const PROFILE_PATH_RE = /^\/in\/[^/]+/i;

export function isLinkedinProfilePage(): boolean {
  return (
    /(?:^|\.)linkedin\.com$/i.test(location.hostname) &&
    PROFILE_PATH_RE.test(location.pathname)
  );
}

export function scrapeCurrentProfile(): ScrapedProfile {
  return {
    full_name: scrapeName(),
    headline: scrapeHeadline(),
    current_title: scrapeCurrentTitle(),
    current_company: scrapeCurrentCompany(),
    location: scrapeLocation(),
    about: scrapeAbout(),
  };
}

// ── helpers ─────────────────────────────────────────────────

/** First non-empty `<h1>` text inside the profile header. */
function scrapeName(): string | null {
  const h1 = document.querySelector<HTMLHeadingElement>(
    "main h1, section h1, h1.text-heading-xlarge, h1",
  );
  return cleanText(h1?.textContent ?? null);
}

/**
 * The "headline" — the role + company line directly under the name.
 * LinkedIn renders it as `.text-body-medium.break-words` adjacent
 * to the h1. We also try a few aria-friendly fallbacks.
 */
function scrapeHeadline(): string | null {
  // Pick the first .text-body-medium element inside the profile top
  // card. Filter out the very common one-liner "Open to work" or
  // "Premium" tagline that LinkedIn renders in the same class.
  const candidates = document.querySelectorAll<HTMLDivElement>(
    "main .text-body-medium, main div.text-body-medium",
  );
  for (const el of Array.from(candidates).slice(0, 5)) {
    const txt = cleanText(el.textContent);
    if (!txt) continue;
    if (/open to|premium|sponsored/i.test(txt)) continue;
    if (txt.length > 4 && txt.length < 200) return txt;
  }
  return null;
}

/**
 * Top-of-experience: the first experience row's title. If the user
 * is between roles, this can be null.
 */
function scrapeCurrentTitle(): string | null {
  const expSection = locateExperienceSection();
  if (!expSection) return null;
  const firstItem = expSection.querySelector<HTMLElement>("li");
  if (!firstItem) return null;
  // Visually-hidden first span typically contains the title text
  // duplicated for screen readers.
  const span = firstItem.querySelector<HTMLSpanElement>(
    "span[aria-hidden='true']",
  );
  return cleanText(span?.textContent ?? firstItem.textContent ?? null);
}

function scrapeCurrentCompany(): string | null {
  const expSection = locateExperienceSection();
  if (!expSection) return null;
  const firstItem = expSection.querySelector<HTMLElement>("li");
  if (!firstItem) return null;
  // The 2nd visible text inside an experience row is usually the
  // company name. Pattern: <h3>Title</h3><span>Company · …</span>
  const spans = firstItem.querySelectorAll<HTMLSpanElement>(
    "span[aria-hidden='true']",
  );
  for (const s of Array.from(spans).slice(1, 4)) {
    const t = cleanText(s.textContent);
    if (!t) continue;
    if (/full-time|part-time|contract|self-employed|present|·/i.test(t)) {
      // Often "Company · Full-time" — split off the company part.
      const first = t.split(/\s*·\s*/)[0];
      if (first && first.length > 1) return cleanText(first);
      continue;
    }
    return t;
  }
  return null;
}

function scrapeLocation(): string | null {
  // The header's small location line. Usually right under headline
  // in a span with class containing "text-body-small".
  const candidates = document.querySelectorAll<HTMLSpanElement>(
    "main span.text-body-small",
  );
  for (const el of Array.from(candidates).slice(0, 8)) {
    const txt = cleanText(el.textContent);
    if (!txt) continue;
    // Heuristic: contains a comma OR a known geographic word, AND
    // isn't a number-only metric like "500+ connections".
    if (
      /,/.test(txt) &&
      !/\bconnection|follower|mutual/i.test(txt) &&
      txt.length < 80
    ) {
      return txt;
    }
  }
  return null;
}

function scrapeAbout(): string | null {
  // The About section. LinkedIn renders the content inside a
  // <div class="display-flex"> with a span aria-hidden="true".
  const aboutSection = document.querySelector("#about")?.closest("section");
  if (!aboutSection) return null;
  const span = aboutSection.querySelector<HTMLSpanElement>(
    "span[aria-hidden='true']",
  );
  return cleanText(span?.textContent ?? null, 2000);
}

function locateExperienceSection(): HTMLElement | null {
  const anchor = document.querySelector<HTMLElement>("#experience");
  return anchor?.closest("section");
}

/** Collapse whitespace, strip null. Optionally cap length. */
function cleanText(raw: string | null | undefined, max = 500): string | null {
  if (!raw) return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) + "…" : t;
}
