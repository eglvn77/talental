// data.js — ATS fixture
const ATS_CANDS = [
  { id: "a1", name: "María Reyes Soto", title: "VP Growth — Cabify", loc: "CDMX, MX", score: 94, stage: "shortlist", source: "ai", color: "#5C6B3F" },
  { id: "a2", name: "Felipe Quiroga", title: "Head of Growth — dLocal", loc: "Buenos Aires", score: 91, stage: "shortlist", source: "ai", color: "#6B7A4E" },
  { id: "a3", name: "Daniela Ortega", title: "Head of Growth — Loft", loc: "CDMX, MX", score: 87, stage: "screening", source: "outbound", color: "#4A4639" },
  { id: "a4", name: "Carlos Méndez", title: "Head of Growth — Kavak", loc: "CDMX, MX", score: 85, stage: "screening", source: "referral", color: "#1C1B16" },
  { id: "a5", name: "Lía Fernández", title: "Growth Lead — Rappi", loc: "Medellín, CO", score: 82, stage: "screening", source: "ai", color: "#B8862D" },
  { id: "a6", name: "Andrés Vela", title: "VP Growth — Bitso", loc: "Lisbon, PT", score: 78, stage: "sourced", source: "outbound", color: "#807866" },
  { id: "a7", name: "Paula Sosa", title: "Sr. Growth — Nubank", loc: "Bogotá, CO", score: 76, stage: "sourced", source: "inbound", color: "#5C6B3F" },
  { id: "a8", name: "Jorge Salazar", title: "Head of Growth — Meli", loc: "Buenos Aires", score: 74, stage: "sent", source: "ai", color: "#6B7A4E" },
  { id: "a9", name: "Renata Lopes", title: "Growth Director — Quinto Andar", loc: "São Paulo", score: 71, stage: "passed", source: "ai", color: "#8E3829" },
  { id: "a10", name: "Esteban Ruiz", title: "Growth PM — Justo", loc: "CDMX, MX", score: 69, stage: "sourced", source: "outbound", color: "#4A4639" },
];

const ATS_NAV = [
  { group: "WORKSPACE", items: [
    { id: "inbox", icon: "Inbox", label: "Inbox", count: "14" },
    { id: "searches", icon: "Briefcase", label: "Searches", count: "4" },
    { id: "candidates", icon: "Users", label: "Candidates", count: "1,284", active: true },
    { id: "calendar", icon: "Calendar", label: "Calendar" },
  ]},
  { group: "SOURCING", items: [
    { id: "sourcer", icon: "Sparkles", label: "AI sourcer" },
    { id: "templates", icon: "FileText", label: "Templates" },
    { id: "clients", icon: "User", label: "Clients" },
  ]},
];

const AI_SUGGESTIONS = [
  { id: "p1", name: "Sofía Carranza", sub: "Growth Lead — Bitso · 9y · CDMX", color: "#B8862D", why: "Built Bitso's Mexico growth team from 0→14. Quoted in your client's reference list as someone they'd love to talk to." },
  { id: "p2", name: "Mateo Restrepo", sub: "Director of Growth — Habi · 11y · Bogotá", color: "#6B7A4E", why: "PLG-native, Spanish-EN bilingual, currently in role but liked 3 of your last 6 outbounds." },
];

Object.assign(window, { ATS_CANDS, ATS_NAV, AI_SUGGESTIONS });
