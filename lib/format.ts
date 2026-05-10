const FREQUENCY_ABBREV: Record<string, string> = {
  monthly: "mo",
  annual: "yr",
  yearly: "yr",
  weekly: "wk",
  hourly: "hr",
};

/** "$50,000–$80,000 MXN" — handles partial ranges and renders nothing if both null. */
export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);
  if (!hasMin && !hasMax) return null;
  const cur = currency?.trim().toUpperCase() || "MXN";
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (hasMin && hasMax) return `${fmt(min!)}–${fmt(max!)} ${cur}`;
  if (hasMin) return `from ${fmt(min!)} ${cur}`;
  return `up to ${fmt(max!)} ${cur}`;
}

export function formatCurrentComp(
  amount: number | null,
  currency: string | null,
  frequency: string | null,
): string | null {
  if (amount === null || currency === null || frequency === null) return null;
  if (!Number.isFinite(amount)) return null;
  const key = frequency.trim().toLowerCase();
  const abbr = FREQUENCY_ABBREV[key] ?? key;
  return `$${amount.toLocaleString("en-US")} ${currency}/${abbr}`;
}

export function relativeTimeShort(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min === 1) return "1 minute ago";
  if (min < 60) return `${min} minutes ago`;
  const hr = Math.round(min / 60);
  if (hr === 1) return "1 hour ago";
  if (hr < 24) return `${hr} hours ago`;
  const days = Math.round(hr / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
