"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CompanyStatus } from "@/lib/hiring";
import { createCompanyAction } from "../actions";

const STATUSES: CompanyStatus[] = ["prospect", "client", "partner", "none"];

export function CreateCompanyButton() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ New company</Button>;
  }
  return <Form onClose={() => setOpen(false)} />;
}

function Form({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createCompanyAction({
        name: String(fd.get("name") ?? ""),
        websiteUrl: (fd.get("website_url") as string) || undefined,
        linkedinUrl: (fd.get("linkedin_url") as string) || undefined,
        status: (fd.get("status") as CompanyStatus) || "prospect",
      });
      if (!res.ok) setError(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="absolute right-6 top-24 z-30 w-[360px] rounded-lg border border-border bg-card p-4 shadow-lg"
    >
      <h3 className="mb-3 text-sm font-semibold">New company</h3>
      <div className="space-y-2">
        <Input name="name" placeholder="Company name *" required />
        <Input
          name="website_url"
          placeholder="https://example.com"
          type="url"
        />
        <Input name="linkedin_url" placeholder="LinkedIn URL" />
        <select
          name="status"
          defaultValue="prospect"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Logo and domain auto-fetched from the website.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}
