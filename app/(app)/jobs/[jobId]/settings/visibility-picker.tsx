"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { updateJobAction } from "../../../actions";

type Visibility = "private" | "team";

/**
 * Project-style visibility picker for a vacante.
 *
 *   private — only admins + the assigned recruiter can open the
 *             vacante. Today's default; preserves the historical
 *             "recruiters see only what's theirs" UX.
 *   team    — anyone in the workspace can read the vacante (good
 *             for cross-team initiatives, leadership searches the
 *             whole team should be aware of, etc.). Edit + delete
 *             privileges stay gated by the existing policies.
 *
 * Admin-only at the UI gate; the server action additionally relies
 * on the existing requireAdmin check in updateJobAction.
 */
export function VisibilityPicker({
  jobId,
  initial,
  canEdit,
}: {
  jobId: string;
  initial: Visibility;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Visibility>(initial);
  const [isPending, startTransition] = useTransition();

  function onChange(next: Visibility) {
    if (next === value) return;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const res = await updateJobAction({ jobId, visibility: next });
      if (!res.ok) {
        toast.actionFailed("No se pudo actualizar la visibilidad", res.error);
        setValue(prev);
        return;
      }
      router.refresh();
    });
  }

  const help =
    value === "team"
      ? "Cualquier miembro del workspace puede abrir esta vacante."
      : "Solo el reclutador asignado y los admins pueden abrir esta vacante.";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as Visibility)}
          disabled={!canEdit || isPending}
          className="h-9 max-w-md flex-1 rounded-md border border-border bg-bg-1 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="private">Privada — solo reclutador + admins</option>
          <option value="team">Visible para todo el equipo</option>
        </select>
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">{help}</p>
    </div>
  );
}
