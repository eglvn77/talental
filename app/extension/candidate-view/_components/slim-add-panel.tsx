"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";

/**
 * "Todavía no está" panel: when the LinkedIn URL the recruiter is
 * viewing isn't in the workspace yet. Mirrors the extension popup's
 * not_found state but with more room (sidepanel is ~400px wide).
 *
 * Hits /api/extension/save-link to create the candidate. After save,
 * forces the iframe to re-render at the same URL so the now-existing
 * candidate gets shown via the normal slim view branch.
 */
export function SlimAddPanel({ url }: { url: string }) {
  const [jobs, setJobs] = useState<
    Array<{ id: string; title: string; company_name: string | null }>
  >([]);
  const [jobId, setJobId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/extension/jobs", {
          credentials: "include",
        });
        const j = await r.json();
        if (!alive || !j.ok) return;
        setJobs(j.jobs ?? []);
      } catch {
        /* swallow — picker is optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function add() {
    setError(null);
    startSave(async () => {
      try {
        const r = await fetch("/api/extension/save-link", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, job_id: jobId || null }),
        });
        const j = await r.json();
        if (!j.ok) {
          setError(j.error ?? "No se pudo agregar.");
          return;
        }
        // Force a remount of this iframe — the slim view will now
        // hit the "exists" branch on reload.
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sin conexión.");
      }
    });
  }

  return (
    <div className="px-4 py-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
          Todavía no está
        </span>
        <h2 className="mt-3 text-sm font-medium">
          Este perfil aún no está en tu base.
        </h2>
        <p className="mt-1 text-xs text-muted-foreground break-all">
          {url}
        </p>

        {jobs.length > 0 ? (
          <>
            <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Asociar a una vacante (opcional)
            </label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Sin vacante (talent pool)</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.company_name ? `${j.title} — ${j.company_name}` : j.title}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <button
          type="button"
          onClick={add}
          disabled={saving}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-bone hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Agregar a Talental
        </button>
        {error ? (
          <p className="mt-2 text-xs text-danger">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
