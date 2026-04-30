"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Job = {
  id: number;
  position_name: string;
  organization_name: string | null;
  status: string | null;
};

export default function NewPortalLinkPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [clientName, setClientName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string } | null>(null);

  // Manatal's /jobs/ endpoint silently ignores search params, so we fetch
  // the full list once and filter client-side.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingJobs(true);
      setJobsError(null);
      try {
        const res = await fetch(`/api/admin/jobs`, { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as {
          jobs?: Job[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        if (!cancelled) setJobs(body.jobs ?? []);
      } catch (err) {
        if (!cancelled) {
          setJobs([]);
          setJobsError(err instanceof Error ? err.message : "Failed to load jobs");
        }
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      `${j.position_name} ${j.organization_name ?? ""}`.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  const canSubmit = useMemo(
    () => Boolean(selectedJob && clientName.trim().length > 0 && !submitting),
    [selectedJob, clientName, submitting],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJob) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/portal-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manatal_job_id: selectedJob.id,
          manatal_job_position_name: selectedJob.position_name,
          manatal_organization_name: selectedJob.organization_name,
          client_display_name: clientName.trim(),
          expires_at: expiresAt || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: { url: string } = await res.json();
      setCreated({ url: data.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold">Portal link created</h1>
              <p className="text-sm text-muted-foreground">
                Share this URL with the client.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <code className="flex-1 truncate">{created.url}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(created.url)}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Pre-loading candidates in the background — your client can open
              the link immediately.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => router.push("/admin")}>
                Back to list
              </Button>
              <Button
                onClick={() => {
                  setCreated(null);
                  setSelectedJob(null);
                  setClientName("");
                  setExpiresAt("");
                  setSearch("");
                }}
              >
                Create another
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold">New portal link</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Manatal job</label>
          {selectedJob ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{selectedJob.position_name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedJob.organization_name || "—"} · ID {selectedJob.id}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedJob(null)}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Search jobs by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                {loadingJobs ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : jobsError ? (
                  <div className="px-3 py-3 text-sm text-red-600">
                    Couldn&apos;t load jobs from Manatal: {jobsError}
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    {jobs.length === 0
                      ? "No jobs in Manatal."
                      : `No matches for "${search}".`}
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredJobs.map((j) => (
                      <li key={j.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => setSelectedJob(j)}
                        >
                          <span className="font-medium">{j.position_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {j.organization_name || "—"} · ID {j.id}
                            {j.status && j.status !== "active"
                              ? ` · ${j.status}`
                              : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="client">
            Client display name
          </label>
          <Input
            id="client"
            placeholder="e.g. Canva"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="expires">
            Expires at <span className="text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create portal link"}
          </Button>
        </div>
      </form>
    </main>
  );
}
