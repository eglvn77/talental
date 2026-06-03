/**
 * Custom-field select option shape.
 *
 * Persisted form (jsonb): `Array<string | { value: string; color?: string }>`.
 * Older definitions store plain strings; the editor now writes the rich
 * object form. `normalizeOptions()` turns either shape into the uniform
 * `OptionItem` array the UI and renderers consume.
 */

export type OptionItem = {
  value: string;
  /** Hex color (e.g. "#5C6B3F") or null when the workspace hasn't
   *  assigned one yet. Falls back to a neutral stone in the chip
   *  renderer. */
  color: string | null;
};

/** Default color when an option doesn't have one set yet — matches the
 *  "info / stone" semantic (neutral). */
export const DEFAULT_OPTION_COLOR = "#807866";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function sanitizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return HEX.test(t) ? t : null;
}

export function normalizeOptions(
  raw: unknown,
): OptionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: OptionItem[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const value = item.trim();
      if (value) out.push({ value, color: null });
    } else if (item && typeof item === "object") {
      const obj = item as { value?: unknown; color?: unknown };
      if (typeof obj.value === "string") {
        const value = obj.value.trim();
        if (value) out.push({ value, color: sanitizeHex(obj.color) });
      }
    }
  }
  return out;
}

/** Look up a single option's color, falling back to the neutral stone. */
export function colorForOption(
  options: OptionItem[],
  value: string,
): string {
  const o = options.find((x) => x.value === value);
  return o?.color ?? DEFAULT_OPTION_COLOR;
}
