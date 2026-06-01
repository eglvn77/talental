"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type { JobRequirements } from "@/lib/hiring";
import { updateJobAction } from "@/app/(app)/actions";
import { SortableList } from "./paquete-editors";

type Bucket = "must" | "nice";
type Row = { _id: string; text: string };

function uid(): string {
  return crypto.randomUUID();
}

/**
 * Requirements editor. Two stacked sections — imprescindibles
 * (must-haves) on top, deseables (nice-to-haves) below — each a
 * full-width, reorderable list so a long requirement is readable across
 * the whole row instead of being clipped in a narrow column. Drag the
 * handle or use the up/down arrows to reorder; rows persist on blur,
 * reorder, add and remove.
 */
export function RequirementsEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: JobRequirements;
}) {
  const t = useT();
  const [must, setMust] = useState<Row[]>(() =>
    (initial.must ?? []).map((text) => ({ _id: uid(), text })),
  );
  const [nice, setNice] = useState<Row[]>(() =>
    (initial.nice ?? []).map((text) => ({ _id: uid(), text })),
  );
  const [, start] = useTransition();

  function persist(nextMust: Row[], nextNice: Row[]) {
    setMust(nextMust);
    setNice(nextNice);
    start(async () => {
      const res = await updateJobAction({
        jobId,
        requirements: {
          must: nextMust.map((r) => r.text.trim()).filter(Boolean),
          nice: nextNice.map((r) => r.text.trim()).filter(Boolean),
        },
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <div className="space-y-8">
      <Section
        title={t("jobSubtabs.requirementsMustTitle")}
        placeholder={t("jobSubtabs.requirementsMustPlaceholder")}
        rows={must}
        setRowsLocal={setMust}
        onReorder={(next) => persist(next, nice)}
        onPersist={() => persist(must, nice)}
        addLabel={t("jobSubtabs.add")}
        bucket="must"
      />
      <Section
        title={t("jobSubtabs.requirementsNiceTitle")}
        placeholder={t("jobSubtabs.requirementsNicePlaceholder")}
        rows={nice}
        setRowsLocal={setNice}
        onReorder={(next) => persist(must, next)}
        onPersist={() => persist(must, nice)}
        addLabel={t("jobSubtabs.add")}
        bucket="nice"
      />
    </div>
  );
}

function Section({
  title,
  placeholder,
  rows,
  setRowsLocal,
  onReorder,
  onPersist,
  addLabel,
  bucket,
}: {
  title: string;
  placeholder: string;
  rows: Row[];
  setRowsLocal: React.Dispatch<React.SetStateAction<Row[]>>;
  onReorder: (next: Row[]) => void;
  onPersist: () => void;
  addLabel: string;
  bucket: Bucket;
}) {
  function patch(id: string, text: string) {
    setRowsLocal((cur) => cur.map((r) => (r._id === id ? { ...r, text } : r)));
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <SortableList
        items={rows}
        onReorder={onReorder}
        onRemove={(id) => onReorder(rows.filter((r) => r._id !== id))}
        onAdd={() => setRowsLocal((cur) => [...cur, { _id: uid(), text: "" }])}
        addLabel={addLabel}
        emptyLabel=""
        renderItem={(r) => (
          <textarea
            key={`${bucket}-${r._id}`}
            value={r.text}
            placeholder={placeholder}
            onChange={(e) => patch(r._id, e.target.value)}
            onBlur={onPersist}
            rows={1}
            className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm leading-relaxed"
          />
        )}
      />
    </div>
  );
}
