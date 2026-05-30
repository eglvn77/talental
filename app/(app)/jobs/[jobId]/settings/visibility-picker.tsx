"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
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
  const t = useT();
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
        toast.actionFailed(t("jobSubtabs.visibilityUpdateFailed"), res.error);
        setValue(prev);
        return;
      }
      router.refresh();
    });
  }

  const help =
    value === "team"
      ? t("jobSubtabs.visibilityHelpTeam")
      : t("jobSubtabs.visibilityHelpPrivate");

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Select
          value={value}
          onChange={(v) => onChange(v as Visibility)}
          disabled={!canEdit || isPending}
          className="max-w-md flex-1"
          options={[
            {
              value: "private",
              label: t("jobSubtabs.visibilityPrivateOption"),
            },
            { value: "team", label: t("jobSubtabs.visibilityTeamOption") },
          ]}
        />
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">{help}</p>
    </div>
  );
}
