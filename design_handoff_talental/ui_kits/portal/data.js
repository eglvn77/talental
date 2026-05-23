// data.js — fixture data for the portal demo
const PORTAL_SEARCHES = [
  {
    id: "s1", role: "Head of Growth", company: "Mercury-stage fintech",
    location: "LATAM · Remote", salary: "$140k–$180k", started: "Apr 02",
    sourced: 47, screened: 18, shortlist: 5, sent: 3, hired: 0,
    progress: 0.62, stage: "SHORTLIST",
  },
  {
    id: "s2", role: "VP Marketing", company: "B2B SaaS · São Paulo",
    location: "São Paulo", salary: "$160k–$210k", started: "Mar 28",
    sourced: 62, screened: 24, shortlist: 7, sent: 5, hired: 1,
    progress: 0.92, stage: "HIRED",
  },
  {
    id: "s3", role: "Director of Operations", company: "Series B marketplace",
    location: "CDMX", salary: "$130k–$160k", started: "Apr 14",
    sourced: 22, screened: 6, shortlist: 0, sent: 0, hired: 0,
    progress: 0.20, stage: "SCREENING",
  },
  {
    id: "s4", role: "Chief of Staff", company: "Consumer fintech",
    location: "Bogotá · Hybrid", salary: "$120k–$150k", started: "Apr 20",
    sourced: 8, screened: 0, shortlist: 0, sent: 0, hired: 0,
    progress: 0.08, stage: "SOURCING",
  },
];

const PORTAL_CANDIDATES = {
  s1: {
    Sourced: [
      { id: "c1", name: "Daniela Ortega", title: "Head of Growth — Loft", loc: "CDMX", years: "9y", stars: 4, color: "#6B7A4E" },
      { id: "c2", name: "Andrés Vela", title: "VP Growth — Bitso", loc: "Lisbon", years: "11y", stars: 3, color: "#B8862D" },
      { id: "c3", name: "Paula Sosa", title: "Sr. Growth — Nubank", loc: "Bogotá", years: "7y", stars: 4, color: "#5C6B3F" },
    ],
    Screened: [
      { id: "c4", name: "Carlos Méndez", title: "Head of Growth — Kavak", loc: "CDMX", years: "10y", stars: 5, color: "#4A4639", note: "Strong PLG background, ex-Atlassian." },
      { id: "c5", name: "Lía Fernández", title: "Growth Lead — Rappi", loc: "Medellín", years: "8y", stars: 4, color: "#1C1B16" },
    ],
    Shortlist: [
      { id: "c6", name: "María Reyes Soto", title: "VP Growth — Cabify", loc: "CDMX", years: "12y", stars: 5, color: "#5C6B3F", note: "Top of the list. Led Cabify's LATAM expansion." },
      { id: "c7", name: "Felipe Quiroga", title: "Head of Growth — dLocal", loc: "Buenos Aires", years: "10y", stars: 5, color: "#6B7A4E", note: "Currently in role; open to a move for the right team." },
    ],
    Sent: [
      { id: "c8", name: "Jorge Salazar", title: "Head of Growth — Mercado Libre", loc: "Buenos Aires", years: "11y", stars: 4, color: "#B8862D", note: "Sent to client Apr 28. Two rounds completed." },
    ],
    Hired: [],
  },
};

const PORTAL_STAGES = ["Sourced", "Screened", "Shortlist", "Sent", "Hired"];

Object.assign(window, { PORTAL_SEARCHES, PORTAL_CANDIDATES, PORTAL_STAGES });
