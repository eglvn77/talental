"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import type { JobRequirements } from "@/lib/hiring";
import { updateJobAction } from "@/app/(app)/actions";

type Bucket = "must" | "nice";

export function RequirementsEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: JobRequirements;
}) {
  const [requirements, setRequirements] = useState<JobRequirements>({
    must: initial.must ?? [],
    nice: initial.nice ?? [],
  });
  const [, startTransition] = useTransition();

  function persist(next: JobRequirements) {
    setRequirements(next);
    startTransition(async () => {
      const res = await updateJobAction({ jobId, requirements: next });
      if (!res.ok) toast.saveFailed(res.error);
      // No router.refresh(): local state is the source of truth here;
      // updateJobAction revalidates the path for next navigation.
    });
  }

  function updateItem(bucket: Bucket, index: number, value: string) {
    const next = {
      ...requirements,
      [bucket]: requirements[bucket].map((v, i) => (i === index ? value : v)),
    };
    setRequirements(next);
  }

  function commitItem(bucket: Bucket) {
    persist(requirements);
  }

  function addItem(bucket: Bucket) {
    const next = {
      ...requirements,
      [bucket]: [...requirements[bucket], ""],
    };
    setRequirements(next);
  }

  function removeItem(bucket: Bucket, index: number) {
    const next = {
      ...requirements,
      [bucket]: requirements[bucket].filter((_, i) => i !== index),
    };
    persist(next);
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Bucket
        title="Imprescindibles"
        items={requirements.must}
        onUpdate={(i, v) => updateItem("must", i, v)}
        onCommit={() => commitItem("must")}
        onRemove={(i) => removeItem("must", i)}
        onAdd={() => addItem("must")}
        placeholder="Ej: 5+ años en B2C growth marketing"
      />
      <Bucket
        title="Deseables"
        items={requirements.nice}
        onUpdate={(i, v) => updateItem("nice", i, v)}
        onCommit={() => commitItem("nice")}
        onRemove={(i) => removeItem("nice", i)}
        onAdd={() => addItem("nice")}
        placeholder="Ej: Experiencia con Mixpanel"
      />
    </div>
  );
}

function Bucket({
  title,
  items,
  onUpdate,
  onCommit,
  onRemove,
  onAdd,
  placeholder,
}: {
  title: string;
  items: string[];
  onUpdate: (i: number, v: string) => void;
  onCommit: () => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="group flex items-center gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => onUpdate(i, e.target.value)}
              onBlur={onCommit}
              placeholder={placeholder}
              className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
              aria-label="Quitar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Agregar
      </button>
    </div>
  );
}
