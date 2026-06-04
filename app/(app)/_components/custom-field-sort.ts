import { normalizeOptions } from "@/lib/custom-fields-options";

/**
 * Map a custom-field cell value into something comparable by the
 * table sort routines. Strings come back lower-cased; numbers stay
 * numeric; dates use the ISO string (lexicographically sortable);
 * booleans collapse to 1/0; multi_select returns null (ambiguous —
 * we skip making it sortable in the UI).
 *
 * For `select`: when the definition exposes its `options` array we
 * sort by the option's INDEX in that array rather than alphabetically.
 * That way reordering options in /settings/custom-fields directly
 * controls the table sort order (e.g. P1 → P2 → P3, or the SOP-style
 * "Waiting on Client Calibration" → … → "On Hold"). Falls back to
 * lowercased value when options aren't available.
 *
 * null is "missing" and the caller can sort missing rows to the end
 * regardless of direction.
 */
export function customFieldSortValue(
  def: { kind: string; options?: unknown },
  value: unknown,
): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  switch (def.kind) {
    case "number":
      return typeof value === "number" ? value : null;
    case "boolean":
      return value === true ? 1 : value === false ? 0 : null;
    case "date":
      return typeof value === "string" ? value : null;
    case "select": {
      if (typeof value !== "string") return null;
      if (def.options !== undefined) {
        const opts = normalizeOptions(def.options);
        if (opts.length > 0) {
          const idx = opts.findIndex((o) => o.value === value);
          // Unknown option (option was deleted but value still on a
          // row) sorts after all known ones; ties on idx use the
          // value itself for stability.
          return idx === -1 ? opts.length : idx;
        }
      }
      return value.toLowerCase();
    }
    case "text":
    case "long_text":
    case "email":
    case "url":
      return typeof value === "string" ? value.toLowerCase() : null;
    default:
      return null;
  }
}

/** Per-kind decision: does the table render a sortable header for it? */
export function isSortableKind(kind: string): boolean {
  return (
    kind === "text" ||
    kind === "long_text" ||
    kind === "email" ||
    kind === "url" ||
    kind === "select" ||
    kind === "number" ||
    kind === "date" ||
    kind === "boolean"
  );
}

/** Comparator used by every table's sort callback when the active
 *  sort key targets a custom field definition. Returns the standard
 *  -1 / 0 / +1 (caller flips for desc direction); missing values
 *  always sort to the end. */
export function compareCustomFieldValues(
  def: { kind: string; options?: unknown },
  aValue: unknown,
  bValue: unknown,
): number {
  const a = customFieldSortValue(def, aValue);
  const b = customFieldSortValue(def, bValue);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
