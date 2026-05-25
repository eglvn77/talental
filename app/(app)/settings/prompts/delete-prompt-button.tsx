"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { deletePromptAction } from "../actions";

/**
 * Inline delete affordance for the Prompts list. Lives outside the
 * row's main Link so the click doesn't navigate to the editor on a
 * misclick — and a separate component so the trash button can carry
 * a confirm dialog without dragging "use client" up onto the page.
 */
export function DeletePromptButton({
  promptId,
  promptKey,
  promptLabel,
}: {
  promptId: string;
  promptKey: string;
  promptLabel: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function onConfirm() {
    setPending(true);
    const res = await deletePromptAction({
      promptId,
      key: promptKey,
    });
    setPending(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo eliminar", res.error);
      return;
    }
    toast.actionOk("Prompt eliminado");
    setConfirming(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Stop the row's Link from navigating to the editor when the
          // admin's intent was the trash icon.
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        disabled={pending}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger disabled:opacity-40"
        aria-label="Eliminar prompt"
        title="Eliminar"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Eliminar "${promptLabel}"`}
        description="Si es un prompt del sistema, perderás cualquier personalización; la próxima visita a la lista lo va a reseed-ear con el default."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onConfirm}
      />
    </>
  );
}
