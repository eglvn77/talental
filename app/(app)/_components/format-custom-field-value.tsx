import type { TFunction } from "@/lib/i18n/translate";

/**
 * Render a custom-field value as table-cell text. Display-only; used
 * by every entity table that surfaces custom-field columns. Select-
 * kind cells get the inline editor instead (see <InlineSelectCell>),
 * so this helper renders the read-only fallback for everything else.
 *
 * Translations are keyed under `shared.customField*` so the same
 * helper works in every module without bleeding entity-specific
 * namespaces into the rendering layer.
 */
export function formatCustomFieldValue(
  def: { kind: string },
  value: unknown,
  t: TFunction,
): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  switch (def.kind) {
    case "boolean":
      return value === true
        ? t("shared.customFieldYes")
        : value === false
          ? t("shared.customFieldNo")
          : "—";
    case "multi_select":
      return Array.isArray(value) ? value.join(", ") || "—" : "—";
    case "date":
      return typeof value === "string" ? value : "—";
    case "number":
      return typeof value === "number" ? value.toLocaleString("es-MX") : "—";
    case "url": {
      // URL columns render as a compact button instead of the raw URL
      // (which usually blows out the column). stopPropagation so a
      // click doesn't also fire the row's onClick.
      const href = typeof value === "string" ? value : "";
      if (!href) return "—";
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded border border-border bg-bg-1 px-2 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent-soft"
          title={href}
        >
          {t("shared.customFieldOpen")} ↗
        </a>
      );
    }
    case "email":
    case "text":
    case "long_text":
    case "select":
    default:
      return String(value);
  }
}
