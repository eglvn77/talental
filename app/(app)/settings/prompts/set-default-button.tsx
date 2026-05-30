"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "@/lib/toast";
import { setDefaultPromptAction } from "../actions";

/** Marks a prompt as its category's default. Shown only on non-default
 *  prompts; the active default renders a static "Default" badge. */
export function SetDefaultButton({ promptId }: { promptId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const res = await setDefaultPromptAction({ promptId });
          if (!res.ok) {
            toast.actionFailed("No se pudo cambiar el default", res.error);
            return;
          }
          toast.actionOk("Default actualizado");
          router.refresh();
        });
      }}
      title="Hacer default de esta categoría"
      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <Star className="h-3 w-3" />
      Hacer default
    </button>
  );
}
