import type { CompanyStatus } from "@/lib/hiring";

/**
 * Display config for the four fixed company statuses. The status set
 * itself is a Postgres enum (not add/delete-able); this only controls
 * the label + color the admin sees. Per-workspace overrides live in
 * `workspaces.company_status_config` (jsonb); anything missing falls
 * back to these defaults so a workspace with no config still renders.
 */
export type CompanyStatusDisplay = { label: string; color: string };

export const COMPANY_STATUS_ORDER: CompanyStatus[] = [
  "client",
  "prospect",
  "partner",
  "none",
];

export const COMPANY_STATUS_DEFAULTS: Record<
  CompanyStatus,
  CompanyStatusDisplay
> = {
  client: { label: "Cliente", color: "#547030" }, // moss
  prospect: { label: "Prospecto", color: "#b87333" }, // ochre
  partner: { label: "Aliado", color: "#6b7548" }, // olive
  none: { label: "Otra", color: "#94a3b8" }, // stone
};

/**
 * Merge a workspace's stored overrides over the defaults. `raw` is
 * the `company_status_config` jsonb (or null). Returns a complete map
 * — every status always resolves to a label + color.
 */
export function resolveCompanyStatusConfig(
  raw: unknown,
): Record<CompanyStatus, CompanyStatusDisplay> {
  const out: Record<CompanyStatus, CompanyStatusDisplay> = {
    client: { ...COMPANY_STATUS_DEFAULTS.client },
    prospect: { ...COMPANY_STATUS_DEFAULTS.prospect },
    partner: { ...COMPANY_STATUS_DEFAULTS.partner },
    none: { ...COMPANY_STATUS_DEFAULTS.none },
  };
  if (raw && typeof raw === "object") {
    for (const s of COMPANY_STATUS_ORDER) {
      const entry = (raw as Record<string, unknown>)[s];
      if (entry && typeof entry === "object") {
        const label = (entry as Record<string, unknown>).label;
        const color = (entry as Record<string, unknown>).color;
        if (typeof label === "string" && label.trim()) {
          out[s].label = label.trim();
        }
        if (typeof color === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
          out[s].color = color;
        }
      }
    }
  }
  return out;
}
