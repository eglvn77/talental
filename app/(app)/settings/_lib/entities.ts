import type { EntityType } from "@/lib/hiring";

/** UI label for each entity_type — what the user sees in the sub-nav. */
export const ENTITY_LABEL: Record<EntityType, string> = {
  candidate: "Candidatos",
  job: "Vacantes",
  application: "Aplicaciones",
  company: "Empresas",
  contact: "Contactos",
  deal: "CRM",
};

/** Stable order for the entity sub-tabs. */
export const ENTITIES: readonly EntityType[] = [
  "candidate",
  "job",
  "application",
  "company",
  "contact",
  "deal",
] as const;

export function isEntityType(v: string): v is EntityType {
  return (ENTITIES as readonly string[]).includes(v);
}
