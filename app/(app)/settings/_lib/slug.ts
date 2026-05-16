/**
 * Convert a human label into a stable snake_case key. Strips Spanish
 * accents (NFD + combining-mark removal), lowercases, replaces every
 * non-alphanumeric run with a single underscore, and trims leading/
 * trailing underscores.
 */
export function toSnakeKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
