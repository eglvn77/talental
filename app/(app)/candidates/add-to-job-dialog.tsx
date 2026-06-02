"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import { addCandidateToJobAction } from "../actions";

export type AddToJobOption = {
  id: string;
  title: string;
  /** Already linked → shown disabled so the recruiter sees why. */
  linked: boolean;
};

/**
 * Header action: link this candidate to a vacancy. Lists the
 * workspace's open jobs; already-linked ones are disabled. Creates an
 * application in the job's first pipeline stage, then routes into the
 * job board so the recruiter lands where the candidate now lives.
 */
export function AddToJobDialog({
  open,
  onOpenChange,
  candidateId,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  options: AddToJobOption[];
}) {
  const t = useT();
  const router = useRouter();
  const [jobId, setJobId] = useState("");
  const [pending, start] = useTransition();

  const selectOptions = useMemo(
    () =>
      options.map((o) => ({
        value: o.id,
        label: o.title,
        hint: o.linked ? t("addToJob.linked") : undefined,
        disabled: o.linked,
      })),
    [options, t],
  );

  function submit() {
    if (!jobId) return;
    start(async () => {
      const res = await addCandidateToJobAction({ candidateId, jobId });
      if (!res.ok) {
        toast.actionFailed(t("addToJob.failed"), res.error);
        return;
      }
      toast.actionOk(t("addToJob.added"));
      onOpenChange(false);
      setJobId("");
      // Stay exactly where we are (the profile panel stays open); just
      // refresh so the new application shows up in the Applications
      // list. No navigation to the job board.
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow-visible so the job <Select> dropdown isn't clipped by
          the dialog's overflow-hidden (the list scrolls internally). */}
      <DialogContent className="max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-4 w-4" />
            {t("addToJob.title")}
          </DialogTitle>
          <DialogDescription>{t("addToJob.description")}</DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("addToJob.noJobs")}
          </p>
        ) : (
          <Select
            value={jobId}
            onChange={setJobId}
            options={selectOptions}
            placeholder={t("addToJob.placeholder")}
            searchable={options.length > 8}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={!jobId || pending}>
            {pending ? t("addToJob.adding") : t("addToJob.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
