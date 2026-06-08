"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus, LinkedinIcon } from "lucide-react";

/**
 * "Todavía no está" state for the side panel iframe. Renders when
 * the LinkedIn URL the recruiter is viewing isn't in their
 * workspace yet. Mirrors the popup's not_found state but uses the
 * extra room of the side panel for a clearer hierarchy.
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
        /* picker is optional */
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
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sin conexión.");
      }
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-stretch justify-center px-4 py-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
          <LinkedinIcon className="h-5 w-5 text-warning" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Todavía no está en tu base
        </h2>
        <p className="mt-1.5 break-all px-2 text-xs text-muted-foreground">
          {url}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {jobs.length > 0 ? (
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Asociar a una vacante (opcional)
            </label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
            >
              <option value="">Sin vacante (talent pool)</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.company_name ? `${j.title} — ${j.company_name}` : j.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button
          type="button"
          onClick={add}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Agregar a Talental
        </button>
        {error ? (
          <p className="text-center text-xs text-danger">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
