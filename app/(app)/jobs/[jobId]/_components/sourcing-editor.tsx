"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type { JobSourcing } from "@/lib/hiring";
import { updateJobAction } from "@/app/(app)/actions";

type Bucket = "criteria" | "questions" | "target_companies";

export function SourcingEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: JobSourcing;
}) {
  const t = useT();
  const [sourcing, setSourcing] = useState<JobSourcing>({
    criteria: initial.criteria ?? [],
    questions: initial.questions ?? [],
    target_companies: initial.target_companies ?? [],
  });
  const [, startTransition] = useTransition();

  function persist(next: JobSourcing) {
    setSourcing(next);
    startTransition(async () => {
      const res = await updateJobAction({ jobId, sourcing: next });
      if (!res.ok) toast.saveFailed(res.error);
      // Local state is canonical while editing; action revalidates the path.
    });
  }

  function updateItem(bucket: Bucket, index: number, value: string) {
    setSourcing({
      ...sourcing,
      [bucket]: sourcing[bucket].map((v, i) => (i === index ? value : v)),
    });
  }

  function commit() {
    persist(sourcing);
  }

  function addItem(bucket: Bucket) {
    setSourcing({
      ...sourcing,
      [bucket]: [...sourcing[bucket], ""],
    });
  }

  function removeItem(bucket: Bucket, index: number) {
    persist({
      ...sourcing,
      [bucket]: sourcing[bucket].filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-5">
      <Bucket
        title={t("jobSubtabs.sourcingCriteriaTitle")}
        description={t("jobSubtabs.sourcingCriteriaDesc")}
        items={sourcing.criteria}
        onUpdate={(i, v) => updateItem("criteria", i, v)}
        onCommit={commit}
        onRemove={(i) => removeItem("criteria", i)}
        onAdd={() => addItem("criteria")}
        placeholder={t("jobSubtabs.sourcingCriteriaPlaceholder")}
      />
      <Bucket
        title={t("jobSubtabs.sourcingQuestionsTitle")}
        description={t("jobSubtabs.sourcingQuestionsDesc")}
        items={sourcing.questions}
        onUpdate={(i, v) => updateItem("questions", i, v)}
        onCommit={commit}
        onRemove={(i) => removeItem("questions", i)}
        onAdd={() => addItem("questions")}
        placeholder={t("jobSubtabs.sourcingQuestionsPlaceholder")}
      />
      <Bucket
        title={t("jobSubtabs.sourcingTargetCompaniesTitle")}
        description={t("jobSubtabs.sourcingTargetCompaniesDesc")}
        items={sourcing.target_companies}
        onUpdate={(i, v) => updateItem("target_companies", i, v)}
        onCommit={commit}
        onRemove={(i) => removeItem("target_companies", i)}
        onAdd={() => addItem("target_companies")}
        placeholder={t("jobSubtabs.sourcingTargetCompaniesPlaceholder")}
      />
    </div>
  );
}

function Bucket({
  title,
  description,
  items,
  onUpdate,
  onCommit,
  onRemove,
  onAdd,
  placeholder,
}: {
  title: string;
  description: string;
  items: string[];
  onUpdate: (i: number, v: string) => void;
  onCommit: () => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  const t = useT();
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="mb-2 text-[10px] text-muted-foreground/80">{description}</p>
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
              aria-label={t("jobSubtabs.remove")}
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
        {t("jobSubtabs.add")}
      </button>
    </div>
  );
}
