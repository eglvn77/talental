/**
 * Backfill: enrich companies by domain via DataForB2B.
 *
 * Enriches every company that has a `domain` and is missing enrichment
 * or stale (enriched_at older than --stale-days). Reuses the shared
 * enrichCompanyByDomain() module — this script only orchestrates
 * (selection, concurrency, rate-limit, retry, progress).
 *
 * Runs under service-role (no request context): passes an explicit
 * client + workspace via `opts.deps`, so the request-bound code paths
 * (hiring()/resolveContext) are never hit.
 *
 * Usage:
 *   # Estimate only — counts qualifying companies + credit cost, spends NOTHING:
 *   npx --yes tsx --env-file=.env.local scripts/backfill-company-enrichment.ts --dry-run
 *
 *   # Real run (cached search, 0.75 cr/result):
 *   npx --yes tsx --env-file=.env.local scripts/backfill-company-enrichment.ts
 *
 * Flags:
 *   --dry-run            Report count + estimated cost, no API calls.
 *   --live               Live search (1.5 cr/result) instead of cached (0.75).
 *   --force              Re-enrich even fresh rows (ignore staleness).
 *   --stale-days=N       Staleness window (default 30).
 *   --concurrency=N      Parallel enrichments (default 4).
 *   --delay-ms=N         Min delay between API calls per worker (default 250).
 *   --max-retries=N      Retries on 429/5xx (default 4).
 *   --limit=N            Cap total companies processed (testing).
 *   --workspace=<uuid>   Restrict to one workspace.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  enrichCompanyByDomain,
  type EnrichByDomainResult,
} from "@/lib/sourcing/dataforb2b";

const CACHED_RATE = 0.75;
const LIVE_RATE = 1.5;

type Args = {
  dryRun: boolean;
  live: boolean;
  force: boolean;
  staleDays: number;
  concurrency: number;
  delayMs: number;
  maxRetries: number;
  limit: number | null;
  workspace: string | null;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const pref = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(pref));
    return hit ? hit.slice(pref.length) : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  const num = (v: string | undefined, def: number) => {
    if (v === undefined) return def;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    dryRun: has("dry-run"),
    live: has("live"),
    force: has("force"),
    staleDays: num(get("stale-days"), 30),
    concurrency: num(get("concurrency"), 4),
    delayMs: num(get("delay-ms"), 250),
    maxRetries: num(get("max-retries"), 4),
    limit: get("limit") ? num(get("limit"), 0) || null : null,
    workspace: get("workspace") ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract an HTTP status from a raw-client error message, e.g.
 *  "DataForB2B /search/companies failed: 429 Too Many Requests". */
function statusFromError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /failed:\s*(\d{3})/.exec(msg);
  return m ? Number.parseInt(m[1], 10) : null;
}

function isRetryable(status: number | null): boolean {
  return status === 429 || (status !== null && status >= 500);
}

type DepsClient = Parameters<typeof enrichCompanyByDomain>[1] extends {
  deps?: infer D;
}
  ? D extends { db: infer C }
    ? C
    : never
  : never;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.DATAFOR_B2B_API_KEY && !args.dryRun) {
    throw new Error("Missing DATAFOR_B2B_API_KEY (needed for non-dry-run).");
  }

  const admin: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = admin.schema("hiring");

  // Candidates: have a domain, and are unenriched or stale.
  const cutoff = new Date(
    Date.now() - args.staleDays * 86_400_000,
  ).toISOString();

  let query = db
    .from("companies")
    .select("id, name, domain, workspace_id, enriched_at")
    .not("domain", "is", null)
    .or(`enriched_at.is.null,enriched_at.lt.${cutoff}`)
    .order("created_at", { ascending: true });
  if (args.workspace) query = query.eq("workspace_id", args.workspace);

  const { data: rows, error } = await query;
  if (error) throw new Error(`Company query failed: ${error.message}`);

  type Row = {
    id: string;
    name: string;
    domain: string;
    workspace_id: string;
    enriched_at: string | null;
  };
  let companies = (rows ?? []) as Row[];
  if (args.limit !== null) companies = companies.slice(0, args.limit);

  const rate = args.live ? LIVE_RATE : CACHED_RATE;

  console.log(
    `[backfill] candidates: ${companies.length} | stale-days=${args.staleDays} | mode=${args.live ? "live" : "cached"} (${rate} cr/result)`,
  );

  if (args.dryRun) {
    // Cost estimate: each qualifying company → 1 search returning up to
    // a few results. We estimate the floor (1 result) for transparency;
    // actual cost depends on results returned per domain.
    const estMin = (companies.length * rate).toFixed(2);
    console.log(
      `[dry-run] Would process ${companies.length} companies.\n` +
        `[dry-run] Estimated cost (≈1 result/company): ${estMin} credits.\n` +
        `[dry-run] No API calls made. Re-run without --dry-run to execute.`,
    );
    return;
  }

  // ---- Concurrency pool + per-worker rate limit + retry/backoff ----
  const tally = {
    enriched: 0,
    low_confidence: 0,
    no_match: 0,
    skipped: 0,
    invalid_domain: 0,
    not_found: 0,
    errors: 0,
  };
  let creditsTotal = 0;
  let processed = 0;
  let cursor = 0;

  async function enrichWithRetry(row: Row): Promise<EnrichByDomainResult> {
    let attempt = 0;
    for (;;) {
      try {
        return await enrichCompanyByDomain(row.domain, {
          companyId: row.id,
          live: args.live,
          force: args.force,
          staleDays: args.staleDays,
          deps: {
            db: db as DepsClient,
            workspaceId: row.workspace_id,
            userId: null,
          },
        });
      } catch (e) {
        const status = statusFromError(e);
        if (isRetryable(status) && attempt < args.maxRetries) {
          const backoff = Math.min(30_000, 1000 * 2 ** attempt);
          console.warn(
            `[retry] ${row.domain} got ${status}; backoff ${backoff}ms (attempt ${attempt + 1}/${args.maxRetries})`,
          );
          await sleep(backoff);
          attempt += 1;
          continue;
        }
        throw e;
      }
    }
  }

  async function worker(id: number) {
    while (true) {
      const i = cursor++;
      if (i >= companies.length) return;
      const row = companies[i];
      try {
        const res = await enrichWithRetry(row);
        tally[res.status] += 1;
        creditsTotal += res.creditsUsed;
      } catch (e) {
        tally.errors += 1;
        console.error(
          `[error] ${row.domain} (${row.id}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      processed += 1;
      if (processed % 25 === 0 || processed === companies.length) {
        console.log(
          `[progress] ${processed}/${companies.length} | credits so far: ${creditsTotal.toFixed(2)}`,
        );
      }
      // Per-worker pacing so N workers don't burst the API.
      if (args.delayMs > 0) await sleep(args.delayMs);
      void id;
    }
  }

  const workers = Array.from(
    { length: Math.max(1, args.concurrency) },
    (_, i) => worker(i),
  );
  await Promise.all(workers);

  console.log("\n[backfill] done.");
  console.log(
    `  enriched=${tally.enriched} low_confidence=${tally.low_confidence} no_match=${tally.no_match} skipped=${tally.skipped} invalid_domain=${tally.invalid_domain} not_found=${tally.not_found} errors=${tally.errors}`,
  );
  console.log(`  total credits consumed: ${creditsTotal.toFixed(2)}`);
}

main().catch((e) => {
  console.error("[fatal]", e instanceof Error ? e.message : e);
  process.exit(1);
});
