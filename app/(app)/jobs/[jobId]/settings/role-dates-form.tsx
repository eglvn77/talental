"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import { updateJobAction } from "../../../actions";

/**
 * Single-field autosave editor for `jobs.open_date`. Used to be
 * larger (target_start_date / hiring_manager_name / language_
 * requirements) but those got removed when the Ajustes UI was
 * simplified — fecha de apertura is the only date the recruiter
 * actually tracks at the workspace level. Hiring manager moved to
 * the contacts multi-picker. Kept as its own component because the
 * autosave dance + last-saved ref reads cleaner in isolation.
 */
export function RoleDatesForm({
  jobId,
  initial,
}: {
  jobId: string;
  initial: {
    open_date: string | null;
  };
}) {
  const t = useT();
  const router = useRouter();
  const [openDate, setOpenDate] = useState(initial.open_date ?? "");
  const lastOpen = useRef(initial.open_date ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOpenDate(initial.open_date ?? "");
    lastOpen.current = initial.open_date ?? "";
  }, [initial]);

  async function commit() {
    if (openDate === lastOpen.current) return;
    const prev = lastOpen.current;
    lastOpen.current = openDate;
    setSaving(true);
    const res = await updateJobAction({
      jobId,
      openDate: openDate || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast.actionFailed(t("jobSubtabs.saveFailed"), res.error);
      setOpenDate(prev);
      lastOpen.current = prev;
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={openDate}
        onChange={(e) => setOpenDate(e.target.value)}
        onBlur={commit}
        className="max-w-[200px]"
      />
      {saving ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
