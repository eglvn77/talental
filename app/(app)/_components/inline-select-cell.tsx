"use client";

import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { upsertCustomFieldValueAction } from "@/app/(app)/settings/actions";

/**
 * Inline select-type custom-field editor for use in table cells.
 * Persists the chosen value via the workspace's standard
 * upsertCustomFieldValueAction. Updates the cell optimistically so
 * the new value appears immediately without waiting for a refetch.
 */
export function InlineSelectCell({
  definitionId,
  entityId,
  initialValue,
  options,
}: {
  definitionId: string;
  entityId: string;
  initialValue: string;
  options: string[];
}) {
  const t = useT();
  const [value, setValue] = useState(initialValue);
  const [, start] = useTransition();

  function commit(next: string) {
    if (next === value) return;
    const prior = value;
    setValue(next);
    start(async () => {
      const res = await upsertCustomFieldValueAction({
        definitionId,
        entityId,
        value: next || null,
      });
      if (!res.ok) {
        toast.saveFailed(res.error);
        setValue(prior);
      }
    });
  }

  return (
    <Select
      value={value}
      onChange={commit}
      placeholder="—"
      searchable={options.length > 5}
      options={[
        { value: "", label: t("shared.clearValue") },
        ...options.map((o) => ({ value: o, label: o })),
      ]}
      className="h-7 min-w-[8rem] text-xs"
    />
  );
}
