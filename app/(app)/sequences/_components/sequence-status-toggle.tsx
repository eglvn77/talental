"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { updateSequenceAction } from "../../_actions/sequences";

/** Active/Paused switch on the sequence detail header. */
export function SequenceStatusToggle({
  sequenceId,
  status,
}: {
  sequenceId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = status === "active";

  function toggle() {
    startTransition(async () => {
      const res = await updateSequenceAction({
        sequenceId,
        patch: { status: active ? "paused" : "active" },
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't update status", res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <span className="text-muted-foreground">Status:</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        onClick={toggle}
        disabled={pending || status === "draft"}
        title={status === "draft" ? "Add steps in the editor, then activate" : undefined}
        className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${
          active ? "bg-success" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-4.5 left-0" : "left-0.5"
          }`}
          style={{ transform: active ? "translateX(18px)" : undefined }}
        />
      </button>
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <span className="font-medium capitalize">{status}</span>
      )}
    </label>
  );
}
