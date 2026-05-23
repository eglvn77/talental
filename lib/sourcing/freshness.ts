/**
 * Freshness rules for the cache-first DataForB2B layer.
 *
 * Each data type has its own TTL because the underlying truth decays
 * at different rates:
 *   - A person's experience history rarely changes day-to-day, but a
 *     verified work email can rot quickly when they move jobs.
 *   - Company firmographics (industry, founded year, HQ) are nearly
 *     static, but funding stage / total funding move faster.
 *   - Cached search results lose relevance fast — new profiles appear
 *     in the candidate pool every day.
 *
 * Defaults live in DEFAULT_TTL_DAYS as constants. The DB table
 * hiring.enrichment_config carries the same values and acts as a
 * runtime override surface: an admin can lower email_work to 30 days
 * without a redeploy by editing that row. The helpers in this module
 * read from constants synchronously; an optional async variant
 * (`isStaleFromConfig`) reads from the DB for code paths that can
 * afford the round-trip.
 *
 * Per the spec: never call /enrich/* without first running isStale()
 * against the row's enriched_at.
 */
import { hiring } from "@/lib/hiring";

export type DataType =
  | "profile_basic"
  | "profile_full"
  | "email_work"
  | "email_personal"
  | "company_firmographics"
  | "company_funding"
  | "search_results";

/**
 * Compile-time defaults. Mirror the seed in the
 * sourcing_cache_layer_schema migration. The DB table is the runtime
 * source of truth; these are the fallback when the table is empty or
 * unreachable.
 */
export const DEFAULT_TTL_DAYS: Record<DataType, number> = {
  profile_basic: 90,
  profile_full: 60,
  email_work: 90,
  email_personal: 90,
  company_firmographics: 90,
  company_funding: 60,
  search_results: 14,
};

const MS_PER_DAY = 86_400_000;

/**
 * Synchronous TTL lookup using the compile-time defaults. Use this
 * in hot paths where the round-trip to enrichment_config isn't
 * worth it (which is most paths).
 */
export function ttlDaysFor(dataType: DataType): number {
  return DEFAULT_TTL_DAYS[dataType];
}

/**
 * Returns true if the value is missing OR older than the TTL for
 * this data type.
 *
 * @param enrichedAt  When the value was last refreshed. `null` /
 *                    `undefined` always counts as stale (never been
 *                    enriched).
 * @param dataType    Which TTL bucket applies.
 * @param overrideDays Optional explicit override. Use when the caller
 *                     needs ultra-fresh data — e.g. before generating
 *                     an AI summary for the slideover, you might
 *                     want anything older than 7 days to refresh.
 *                     Set to 0 to force a refresh.
 */
export function isStale(
  enrichedAt: Date | null | undefined,
  dataType: DataType,
  overrideDays?: number,
): boolean {
  if (!enrichedAt) return true;
  const ttlDays = overrideDays ?? DEFAULT_TTL_DAYS[dataType];
  if (ttlDays <= 0) return true;
  const ageDays = (Date.now() - enrichedAt.getTime()) / MS_PER_DAY;
  return ageDays > ttlDays;
}

/**
 * Compute when a row should be re-enriched, given its data type.
 * Used to populate `next_refresh_at` on candidates / companies after
 * a successful enrichment.
 */
export function nextRefreshDate(
  dataType: DataType,
  overrideDays?: number,
): Date {
  const ttlDays = overrideDays ?? DEFAULT_TTL_DAYS[dataType];
  return new Date(Date.now() + ttlDays * MS_PER_DAY);
}

/**
 * Async variant that reads TTLs from hiring.enrichment_config. Use
 * when an admin has tuned the TTLs at runtime and you want the
 * latest values.
 *
 * Falls back to the compile-time default if the row is missing or
 * the query fails — never throws.
 */
export async function isStaleFromConfig(
  enrichedAt: Date | null | undefined,
  dataType: DataType,
  overrideDays?: number,
): Promise<boolean> {
  if (!enrichedAt) return true;
  if (typeof overrideDays === "number") {
    return isStale(enrichedAt, dataType, overrideDays);
  }
  try {
    const db = await hiring();
    const { data } = await db
      .from("enrichment_config")
      .select("ttl_days")
      .eq("data_type", dataType)
      .maybeSingle();
    const ttlDays =
      typeof data?.ttl_days === "number"
        ? data.ttl_days
        : DEFAULT_TTL_DAYS[dataType];
    const ageDays = (Date.now() - enrichedAt.getTime()) / MS_PER_DAY;
    return ageDays > ttlDays;
  } catch {
    return isStale(enrichedAt, dataType);
  }
}

/**
 * Human-readable "freshness verdict" for UI surfaces — e.g. the
 * candidate slideover can show "datos de hace 12 días" with a hint
 * to refresh manually.
 */
export function freshnessLabel(
  enrichedAt: Date | null | undefined,
  dataType: DataType,
): { state: "fresh" | "stale" | "never"; ageDays: number | null } {
  if (!enrichedAt) return { state: "never", ageDays: null };
  const ageDays = Math.floor(
    (Date.now() - enrichedAt.getTime()) / MS_PER_DAY,
  );
  return {
    state: ageDays > DEFAULT_TTL_DAYS[dataType] ? "stale" : "fresh",
    ageDays,
  };
}
