/**
 * Models available for prompts in the Prompts CMS. Adding a new model
 * here makes it selectable in the dropdown without DB or code changes.
 */

export type ModelOption = {
  value: string;
  label: string;
  provider: "anthropic";
  hint?: string;
};

export const AVAILABLE_MODELS: ReadonlyArray<ModelOption> = [
  {
    value: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    provider: "anthropic",
    hint: "Default. Quality/cost sweet spot for kickoff-style tasks.",
  },
  {
    value: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    provider: "anthropic",
    hint: "Highest quality (1M context). ~10x cost vs. Sonnet.",
  },
  {
    value: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    hint: "Fastest + cheapest. Use for parsing, classification, simple extraction.",
  },
];

export function isKnownModel(v: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.value === v);
}
