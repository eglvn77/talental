// =====================================================
// Default pipeline + category palette.
// =====================================================

import type { PipelineCategory } from "./enums";

export type DefaultStageDef = {
  name: string;
  category: PipelineCategory;
  color: string;
  is_terminal?: boolean;
  client_portal_visible?: boolean;
};

// Default 10-stage pipeline seeded into every new job.
// Names in Spanish (UI labels); categories map to the
// hiring.pipeline_category enum.
export const DEFAULT_PIPELINE_STAGES: DefaultStageDef[] = [
  { name: "Aplicantes", category: "applied", color: "#f97316" },
  { name: "Pre-Aprobados", category: "screening", color: "#fb923c" },
  { name: "Contactados", category: "contacted", color: "#f97316" },
  { name: "Agendados", category: "screening", color: "#3b82f6" },
  {
    name: "Enviados a Empresa",
    category: "submitted",
    color: "#3b82f6",
    client_portal_visible: true,
  },
  {
    name: "Entrevistas con Empresa",
    category: "interview",
    color: "#14b8a6",
    client_portal_visible: true,
  },
  {
    name: "Oferta",
    category: "offer",
    color: "#22c55e",
    client_portal_visible: true,
  },
  { name: "Referencias", category: "offer", color: "#16a34a" },
  {
    name: "Contratado",
    category: "hired",
    color: "#16a34a",
    is_terminal: true,
    client_portal_visible: true,
  },
  {
    name: "Rechazados",
    category: "rejected",
    color: "#ef4444",
    is_terminal: true,
  },
];

// Color hint for a category (used for empty cells, default new stages,
// etc.).
export const CATEGORY_COLOR: Record<PipelineCategory, string> = {
  sourced: "#f97316",
  contacted: "#f97316",
  answered: "#f97316",
  applied: "#f97316",
  screening: "#fb923c",
  submitted: "#3b82f6",
  interview: "#14b8a6",
  offer: "#22c55e",
  hired: "#16a34a",
  rejected: "#ef4444",
  withdrawn: "#f87171",
};
