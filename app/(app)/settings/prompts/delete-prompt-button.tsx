"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
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
  const t = useT();
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
      toast.actionFailed(t("promptsCfg.deleteFailed"), res.error);
      return;
    }
    toast.actionOk(t("promptsCfg.deleteOk"));
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
        aria-label={t("promptsCfg.deleteAriaLabel")}
        title={t("promptsCfg.deleteTitle")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("promptsCfg.deleteConfirmTitle", { label: promptLabel })}
        description={t("promptsCfg.deleteConfirmDescription")}
        confirmLabel={t("promptsCfg.deleteConfirmLabel")}
        destructive
        onConfirm={onConfirm}
      />
    </>
  );
}
