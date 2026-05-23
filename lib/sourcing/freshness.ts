/**
 * Stub. The real implementation lands in PASO 3 (next commit). The
 * wrapper in dataforb2b.ts already references the API surface so the
 * scaffolding compiles. Keep the function signatures stable across
 * the upgrade.
 */

export type DataType =
  | "profile_basic"
  | "profile_full"
  | "email_work"
  | "email_personal"
  | "company_firmographics"
  | "company_funding"
  | "search_results";

const DEFAULT_TTL_DAYS: Record<DataType, number> = {
  profile_basic: 90,
  profile_full: 60,
  email_work: 90,
  email_personal: 90,
  company_firmographics: 90,
  company_funding: 60,
  search_results: 14,
};

export function ttlDaysFor(dataType: DataType): number {
  return DEFAULT_TTL_DAYS[dataType];
}

export function isStale(
  enrichedAt: Date | null,
  dataType: DataType,
  overrideDays?: number,
): boolean {
  if (!enrichedAt) return true;
  const ttlDays = overrideDays ?? DEFAULT_TTL_DAYS[dataType];
  const ageDays = (Date.now() - enrichedAt.getTime()) / 86_400_000;
  return ageDays > ttlDays;
}
