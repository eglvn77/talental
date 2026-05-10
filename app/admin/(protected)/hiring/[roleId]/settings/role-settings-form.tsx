"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type RoleRow } from "@/lib/hiring";
import { updateRoleAction } from "../../actions";
import { NumberInputWithCommas } from "../../new/number-input";

export function RoleSettingsForm({ role }: { role: RoleRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateRoleAction({
        roleId: role.id,
        title: String(fd.get("title") ?? ""),
        location: String(fd.get("location") ?? "") || null,
        salaryMin: fd.get("salary_min")
          ? Number(fd.get("salary_min"))
          : null,
        salaryMax: fd.get("salary_max")
          ? Number(fd.get("salary_max"))
          : null,
        salaryCurrency: String(fd.get("salary_currency") ?? "MXN"),
        publicDescription: String(fd.get("public_description") ?? "") || null,
        aiScoringEnabled: fd.get("ai_scoring_enabled") === "on",
        aiScoringCriteria:
          String(fd.get("ai_scoring_criteria") ?? "") || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Title" required>
        <Input name="title" defaultValue={role.title} required />
      </Field>

      <Field label="Location">
        <Input name="location" defaultValue={role.location ?? ""} />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Salary min">
          <NumberInputWithCommas
            name="salary_min"
            defaultValue={role.salary_min}
          />
        </Field>
        <Field label="Salary max">
          <NumberInputWithCommas
            name="salary_max"
            defaultValue={role.salary_max}
          />
        </Field>
        <Field label="Currency">
          <Input
            name="salary_currency"
            defaultValue={role.salary_currency ?? "MXN"}
          />
        </Field>
      </div>

      <Field label="Public description (shown to candidates pre-unlock)">
        <textarea
          name="public_description"
          rows={4}
          defaultValue={role.public_description ?? ""}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </Field>

      <div className="rounded-md border border-border bg-muted/20 p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="ai_scoring_enabled"
            defaultChecked={role.ai_scoring_enabled}
            className="h-4 w-4"
          />
          AI application scoring
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          When enabled, completed screenings + interviews are scored against
          the criteria below.
        </p>
        <textarea
          name="ai_scoring_criteria"
          rows={3}
          defaultValue={role.ai_scoring_criteria ?? ""}
          placeholder="Example: prioritize product/data experience, B2B SaaS background, stakeholder management, fluent French and English."
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {saved ? <p className="text-xs text-green-700">Saved.</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
