/**
 * Supported salary currencies. Value persisted in DB is the 3-letter code;
 * the label is for display only.
 */
export const CURRENCIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "MXN", label: "MXN - Peso Mexicano" },
  { code: "USD", label: "USD - US Dollar" },
  { code: "BRL", label: "BRL - Real Brasileño" },
  { code: "COP", label: "COP - Peso Colombiano" },
  { code: "ARS", label: "ARS - Peso Argentino" },
  { code: "CLP", label: "CLP - Peso Chileno" },
  { code: "PEN", label: "PEN - Sol Peruano" },
  { code: "EUR", label: "EUR - Euro" },
];

export const DEFAULT_CURRENCY = "MXN";

const CODES = new Set(CURRENCIES.map((c) => c.code));

/** Reject anything outside the supported set so we don't persist garbage. */
export function sanitizeCurrency(value: unknown): string {
  return typeof value === "string" && CODES.has(value) ? value : DEFAULT_CURRENCY;
}
