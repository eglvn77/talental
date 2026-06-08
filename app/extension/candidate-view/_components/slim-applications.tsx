"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { addCandidateToJobAction } from "@/app/(app)/actions";

type App = {
  id: string;
  jobId: string;
  jobTitle: string;
  stageId: string;
  stageName: string;
  stageColor: string | null;
};

type JobOption = {
  id: string;
  title: string;
  companyName: string | null;
};

export function SlimApplications({
  candidateId,
  applications,
  jobs: serverJobs,
}: {
  candidateId: string;
  applications: App[];
  jobs: JobOption[];
}) {
  // Server-rendered jobs prop is the primary source. If it's empty
  // (server query timing out, RLS hiccup, etc.) we lazy-fetch from
  // /api/extension/jobs (same endpoint the popup uses, known good).
  // This belt-and-suspenders gives the dropdown a chance to populate
  // even when the server-side query goes sideways.
  const [jobs, setJobs] = useState<JobOption[]>(serverJobs);
  useEffect(() => {
    if (serverJobs.length > 0) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/extension/jobs", {
          credentials: "include",
        });
        const j = await r.json();
        if (!alive || !j.ok) return;
        type Row = {
          id: string;
          title: string;
          company_name: string | null;
        };
        const mapped: JobOption[] = ((j.jobs ?? []) as Row[]).map((row) => ({
          id: row.id,
          title: row.title,
          companyName: row.company_name,
        }));
        setJobs(mapped);
      } catch (e) {
        console.error("[slim-applications] jobs fetch failed:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [serverJobs]);

  const [addOpen, setAddOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [adding, startAdd] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function add() {
    if (!selectedJob) return;
    setErr(null);
    startAdd(async () => {
      const res = await addCandidateToJobAction({
        candidateId,
        jobId: selectedJob,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setAddOpen(false);
      setSelectedJob("");
      window.location.reload();
    });
  }

  const linkedJobIds = new Set(applications.map((a) => a.jobId));
  const availableJobs = jobs.filter((j) => !linkedJobIds.has(j.id));

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Aplicaciones ({applications.length})
        </h2>
        <button
          type="button"
          onClick={() => setAddOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-foreground hover:bg-muted"
        >
          <Plus className="h-3 w-3" />
          {addOpen ? "Cerrar" : "Agregar"}
        </button>
      </div>

      {addOpen ? (
        <div className="mt-2 rounded-md border border-border bg-card p-2">
          <select
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">Selecciona una vacante…</option>
            {availableJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.companyName ? `${j.title} — ${j.companyName}` : j.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={!selectedJob || adding}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-2 py-1 text-xs font-medium text-bone hover:opacity-90 disabled:opacity-50"
          >
            {adding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Agregar a vacante"
            )}
          </button>
          {err ? (
            <p className="mt-1 text-xs text-danger">{err}</p>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-2 space-y-1.5">
        {applications.length === 0 ? (
          <li className="rounded-md border border-dashed border-border px-2 py-3 text-xs text-muted-foreground">
            Sin aplicaciones todavía
          </li>
        ) : (
          applications.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5"
            >
              <a
                href={`/jobs/${a.jobId}/candidates?application=${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-xs font-medium text-foreground hover:underline"
              >
                {a.jobTitle}
              </a>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: (a.stageColor ?? "#94a3b8") + "22",
                  color: a.stageColor ?? "#475569",
                }}
              >
                {a.stageName}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
