// =====================================================
// Default pipeline + category palette.
// =====================================================

import type { PipelineCategory } from "./enums";

export type DefaultStageDef = {
  name: string;
  category: PipelineCategory;
  color: string;
  /** Shown on the client portal. The terminal-ness is implicit from
   *  the category (hired/rejected/withdrawn), no separate flag. */
  client_portal_visible?: boolean;
};

// Default 10-stage pipeline seeded into every new job. Names in
// Spanish (UI labels); categories map to the canonical
// hiring.pipeline_category enum (sourced .. withdrawn) so analytics
// can roll up across workspaces.
export const DEFAULT_PIPELINE_STAGES: DefaultStageDef[] = [
  { name: "Aplicantes", category: "applicants", color: "#f97316" },
  { name: "Pre-Aprobados", category: "shortlisted", color: "#fb923c" },
  { name: "Contactados", category: "contacted", color: "#f97316" },
  { name: "Llamada Inicial", category: "screen", color: "#3b82f6" },
  {
    name: "Enviados a Empresa",
    category: "submitted",
    color: "#3b82f6",
    client_portal_visible: true,
  },
  {
    name: "Entrevistas con Empresa",
    category: "client_interview",
    color: "#14b8a6",
    client_portal_visible: true,
  },
  {
    name: "Oferta",
    category: "offer",
    color: "#22c55e",
    client_portal_visible: true,
  },
  { name: "Referencias", category: "background_check", color: "#16a34a" },
  {
    name: "Contratado",
    category: "hired",
    color: "#16a34a",
    client_portal_visible: true,
  },
  { name: "Rechazados", category: "rejected", color: "#ef4444" },
];

// Color hint for a category (used for empty cells, default new stages,
// etc.). One palette per category — keep these stable, the UI relies
// on them for the "auto-sync color when category changes" rule.
export const CATEGORY_COLOR: Record<PipelineCategory, string> = {
  sourced: "#a3a3a3",
  applicants: "#f97316",
  shortlisted: "#fb923c",
  contacted: "#f97316",
  conversation: "#eab308",
  screen: "#3b82f6",
  submitted: "#3b82f6",
  client_interview: "#14b8a6",
  assessment: "#0ea5e9",
  background_check: "#16a34a",
  offer: "#22c55e",
  hired: "#16a34a",
  rejected: "#ef4444",
  withdrawn: "#f87171",
};

// Spanish UI labels, in canonical funnel order. Sourced through
// hired is the happy path; rejected + withdrawn are the off-ramps.
export const CATEGORY_LABEL: Record<PipelineCategory, string> = {
  sourced: "Encontrados",
  applicants: "Aplicantes",
  shortlisted: "Pre-aprobados",
  contacted: "Contactados",
  conversation: "Conversación",
  screen: "Llamada inicial",
  submitted: "Enviado a cliente",
  client_interview: "Entrevista cliente",
  assessment: "Caso práctico",
  background_check: "Estudio de antecedentes",
  offer: "Oferta",
  hired: "Contratado",
  rejected: "Rechazado",
  withdrawn: "Declinado",
};

export const CATEGORY_ORDER: PipelineCategory[] = [
  "sourced",
  "applicants",
  "shortlisted",
  "contacted",
  "conversation",
  "screen",
  "submitted",
  "client_interview",
  "assessment",
  "background_check",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
];
