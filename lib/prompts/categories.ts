/**
 * Prompt categories — the fixed, code-defined taxonomy for hiring.prompts.
 *
 * A category is a CONTRACT: its inputs and its output (the tool/JSON
 * schema the model must produce) live in code and cannot be created or
 * renamed from the UI. Within a category a workspace can keep several
 * editable prompts and pick one at run time; exactly one is the default.
 *
 * This replaces role_type branching: instead of one master prompt that
 * switches on role_type, you pick the prompt you want (e.g. a
 * "Headhunting" vs an "Inbound AI" kickoff prompt).
 *
 * To add a category you add it HERE and wire its runner — that's the
 * point of it being code-defined.
 */

export type PromptCategory = "kickoff" | "candidate_report";

export type PromptCategoryDef = {
  key: PromptCategory;
  label: string;
  description: string;
};

export const PROMPT_CATEGORIES: ReadonlyArray<PromptCategoryDef> = [
  {
    key: "kickoff",
    label: "Kickoff de vacante",
    description:
      "Genera el paquete completo de un rol (JD, sourcing, interview script, outreach, preguntas, checklist) a partir del intake. Eliges el prompt al correr el kickoff.",
  },
  {
    key: "candidate_report",
    label: "Reporte de candidato",
    description:
      "Genera el reporte estructurado tras la entrevista (rating, fortalezas, flags, a indagar, compensación).",
  },
];

const CATEGORY_KEYS = new Set<string>(PROMPT_CATEGORIES.map((c) => c.key));

export function isPromptCategory(v: string): v is PromptCategory {
  return CATEGORY_KEYS.has(v);
}

export function promptCategoryLabel(v: string): string {
  return PROMPT_CATEGORIES.find((c) => c.key === v)?.label ?? v;
}
