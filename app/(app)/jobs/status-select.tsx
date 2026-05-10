"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type JobStatus } from "@/lib/hiring";
import { updateJobStatusAction } from "../actions";

const ROLE_STATUS_NEXT: Record<JobStatus, JobStatus[]> = {
  draft: ["awaiting_payment", "closed"],
  awaiting_payment: ["paid", "closed"],
  paid: ["published", "closed"],
  published: ["paused", "closed"],
  paused: ["published", "closed"],
  closed: [],
};

export function JobStatusSelect({
  jobId,
  current,
}: {
  jobId: string;
  current: JobStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = ROLE_STATUS_NEXT[current] ?? [];

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as JobStatus;
    if (next === current) return;
    setError(null);
    startTransition(async () => {
      const res = await updateJobStatusAction(jobId, next);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
        {current}
      </span>
      {options.length > 0 ? (
        <select
          disabled={isPending}
          defaultValue={current}
          onChange={onChange}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value={current}>— cambiar a —</option>
          {options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
