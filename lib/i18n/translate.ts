import type { Messages } from "./messages";
import { es } from "./messages";

export type TVars = Record<string, string | number>;

/** Resolve a dot-path key against a messages object. */
function lookup(obj: unknown, path: string): string | undefined {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(str: string, vars?: TVars): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) =>
    k in vars ? String(vars[k]) : m,
  );
}

/**
 * Translate a key against the active-locale messages. Falls back to the
 * Spanish source when a key is missing in the active locale (keeps the
 * app functional mid-migration), then to the raw key as a last resort.
 */
export function translate(
  messages: Messages,
  key: string,
  vars?: TVars,
): string {
  const hit = lookup(messages, key) ?? lookup(es, key) ?? key;
  return interpolate(hit, vars);
}

export type TFunction = (key: string, vars?: TVars) => string;
