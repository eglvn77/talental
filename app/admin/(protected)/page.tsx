import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getSupabaseAdmin, type PortalLinkRow } from "@/lib/supabase";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { RefreshNowButton } from "./refresh-button";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("portal_links")
    .select("*")
    .order("created_at", { ascending: false });

  const links = (data ?? []) as PortalLinkRow[];
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://clients.talental.mx";

  // Pull freshest last_synced_at per job in one query, joined into the table.
  // Different portal_links rows can share a job_id, so the freshness is per
  // job, not per portal.
  const freshness = new Map<number, string>();
  if (links.length > 0) {
    const jobIds = Array.from(new Set(links.map((l) => l.manatal_job_id)));
    const { data: rows } = await supabase
      .from("candidate_cache")
      .select("manatal_job_id, last_synced_at")
      .in("manatal_job_id", jobIds);
    for (const r of rows ?? []) {
      const cur = freshness.get(r.manatal_job_id);
      if (!cur || new Date(r.last_synced_at as string) > new Date(cur)) {
        freshness.set(r.manatal_job_id, r.last_synced_at as string);
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Portal links</h1>
          <p className="text-sm text-muted-foreground">
            Each link gives a client read-only access to one job&apos;s pipeline.
          </p>
        </div>
        <Link href="/admin/new" className={cn(buttonVariants())}>
          New portal link
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Failed to load: {error.message}</p>
      ) : null}

      {links.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No portal links yet. Create one to share with a client.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Link</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last refreshed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {links.map((link) => {
                const fullUrl = `${siteUrl}/p/${link.slug}`;
                const expired =
                  link.expires_at && new Date(link.expires_at) < new Date();
                return (
                  <tr key={link.id}>
                    <td className="px-4 py-3 font-medium">
                      {link.client_display_name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {link.manatal_job_position_name || `Job ${link.manatal_job_id}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <code
                          className="min-w-0 flex-shrink truncate rounded bg-muted px-2 py-0.5 font-mono text-xs"
                          title={fullUrl}
                        >
                          {fullUrl}
                        </code>
                        <CopyButton value={fullUrl} />
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open in new tab"
                          title="Open in new tab"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {!link.is_active ? (
                        <span className="text-muted-foreground">Disabled</span>
                      ) : expired ? (
                        <span className="text-muted-foreground">Expired</span>
                      ) : (
                        <span className="text-brand">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RefreshNowButton
                        manatalJobId={link.manatal_job_id}
                        initialLastSyncedAt={freshness.get(link.manatal_job_id) ?? null}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
