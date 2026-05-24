"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { updateJobAction } from "@/app/(app)/actions";

type TeamMember = {
  id: string;
  full_name: string | null;
  email: string;
};

/**
 * Equipo picker for the vacante settings tab. Admins can change the
 * assigned recruiter from a dropdown; non-admins see read-only text.
 *
 * Backed by `updateJobAction({ recruiterTeamMemberId })`, which is
 * gated by `requireAdmin()` server-side — the disabled state here is
 * a UX nicety, the real enforcement lives in the action + RLS.
 *
 * `null` for `currentRecruiterId` means unassigned; `null` selection
 * in the dropdown unassigns.
 */
export function TeamPicker({
  jobId,
  currentRecruiterId,
  members,
  canEdit,
}: {
  jobId: string;
  currentRecruiterId: string | null;
  members: TeamMember[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function labelFor(m: TeamMember): string {
    return m.full_name?.trim() || m.email;
  }

  const current = currentRecruiterId
    ? members.find((m) => m.id === currentRecruiterId) ?? null
    : null;

  function onChange(value: string) {
    const next = value === "" ? null : value;
    if (next === (currentRecruiterId ?? null)) return;
    startTransition(async () => {
      const res = await updateJobAction({
        jobId,
        recruiterTeamMemberId: next,
      });
      if (!res.ok) {
        toast.actionFailed("No se pudo cambiar el recruiter", res.error);
        return;
      }
      toast.actionOk(
        next ? "Recruiter asignado" : "Recruiter desasignado",
      );
      router.refresh();
    });
  }

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <UserCircle2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-foreground">
          {current ? labelFor(current) : (
            <span className="text-muted-foreground">Sin asignar</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        Recruiter asignado
      </label>
      <select
        value={currentRecruiterId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="h-9 max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
      >
        <option value="">Sin asignar</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {labelFor(m)}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        El recruiter asignado ve la vacante en su lista y puede mover
        candidatos entre etapas. Solo administradores pueden cambiar
        esta asignación.
      </p>
    </div>
  );
}
