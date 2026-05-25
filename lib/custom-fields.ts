import "server-only";
import {
  hiring,
  type CustomFieldDefinitionRow,
  type CustomFieldValueRow,
  type EntityType,
} from "@/lib/hiring";

export type CustomFieldBundle = {
  definitions: CustomFieldDefinitionRow[];
  valuesByDefId: Record<string, unknown>;
};

/**
 * Load every custom-field definition for the workspace's entity_type
 * plus the current values for one specific entity_id. Returns an empty
 * bundle if there are no definitions yet.
 *
 * RLS handles workspace scoping on both tables.
 */
export async function loadCustomFieldsForEntity(
  entityType: EntityType,
  entityId: string,
): Promise<CustomFieldBundle> {
  const db = await hiring();
  const { data: defs } = await db
    .from("custom_field_definitions")
    .select("*")
    .eq("entity_type", entityType)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const definitions = (defs ?? []) as CustomFieldDefinitionRow[];
  if (definitions.length === 0) {
    return { definitions: [], valuesByDefId: {} };
  }

  const { data: vals } = await db
    .from("custom_field_values")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .in("definition_id", definitions.map((d) => d.id));

  const valuesByDefId: Record<string, unknown> = {};
  for (const v of (vals ?? []) as CustomFieldValueRow[]) {
    valuesByDefId[v.definition_id] = v.value;
  }
  return { definitions, valuesByDefId };
}

export type CustomFieldsListBundle = {
  definitions: CustomFieldDefinitionRow[];
  /**
   * Nested map: entityId → definitionId → value. Empty inner map
   * when an entity has no values set yet.
   */
  valuesByEntityId: Record<string, Record<string, unknown>>;
};

/**
 * Like `loadCustomFieldsForEntity` but batched for the rows on a
 * list page (jobs, candidates, companies, contacts). One query for
 * the workspace's definitions, one query for all the values of the
 * given entity ids. The list table reads filterable + visible-in-
 * columns flags off the definitions and looks up per-row values
 * via `valuesByEntityId[entityId][definitionId]`.
 */
export async function loadCustomFieldsForList(
  entityType: EntityType,
  entityIds: string[],
): Promise<CustomFieldsListBundle> {
  const db = await hiring();
  const { data: defs } = await db
    .from("custom_field_definitions")
    .select("*")
    .eq("entity_type", entityType)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const definitions = (defs ?? []) as CustomFieldDefinitionRow[];
  if (definitions.length === 0 || entityIds.length === 0) {
    return { definitions, valuesByEntityId: {} };
  }

  const { data: vals } = await db
    .from("custom_field_values")
    .select("*")
    .eq("entity_type", entityType)
    .in("entity_id", entityIds)
    .in(
      "definition_id",
      definitions.map((d) => d.id),
    );

  const valuesByEntityId: Record<string, Record<string, unknown>> = {};
  for (const v of (vals ?? []) as CustomFieldValueRow[]) {
    const eid = v.entity_id as string;
    const did = v.definition_id as string;
    (valuesByEntityId[eid] ??= {})[did] = v.value;
  }
  return { definitions, valuesByEntityId };
}
