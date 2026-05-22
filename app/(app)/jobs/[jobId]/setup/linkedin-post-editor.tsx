"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateJobAction } from "@/app/(app)/actions";

export function LinkedinPostEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  function onBlur() {
    if (value === initial) return;
    startTransition(async () => {
      const res = await updateJobAction({ jobId, linkedinPost: value });
      if (!res.ok) {
        toast.error("No se pudo guardar", { description: res.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
      rows={Math.max(6, Math.min(20, (value.split("\n").length || 0) + 1))}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
      placeholder="Pega o edita el LinkedIn post aquí."
    />
  );
}
