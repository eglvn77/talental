"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
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
  const t = useT();
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
        toast.actionFailed(t("jobSubtabs.recruiterChangeFailed"), res.error);
        return;
      }
      toast.actionOk(
        next
          ? t("jobSubtabs.recruiterAssigned")
          : t("jobSubtabs.recruiterUnassigned"),
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
            <span className="text-muted-foreground">
              {t("jobSubtabs.unassigned")}
            </span>
          )}
        </span>
      </div>
    );
  }

  // The parent (Ajustes) supplies the "Recruiter asignado" label via
  // its <Field> wrapper, so we don't render an internal label here —
  // would have duplicated. Helper copy below is unchanged.
  return (
    <div className="flex flex-col gap-1">
      <Select
        value={currentRecruiterId ?? ""}
        onChange={(v) => onChange(v)}
        disabled={pending}
        className="max-w-md"
        placeholder={t("jobSubtabs.unassigned")}
        searchable={members.length > 8}
        options={[
          { value: "", label: t("jobSubtabs.unassigned") },
          ...members.map((m) => ({
            value: m.id,
            label: labelFor(m),
            hint: m.email ?? undefined,
          })),
        ]}
      />
      <p className="text-[11px] text-muted-foreground">
        {t("jobSubtabs.recruiterHelp")}
      </p>
    </div>
  );
}
