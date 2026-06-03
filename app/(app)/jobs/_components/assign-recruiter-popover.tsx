"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, UserCircle2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import {
  bulkAssignRecruiterAction,
  loadAssignableMembersAction,
} from "../../actions";

/**
 * Inline popover surfaced from the BulkActionsBar — given the current
 * jobs selection, lets the admin assign (or clear) a recruiter on all
 * of them in one call. Loads team members on first open.
 */
export function AssignRecruiterPopover({
  selectedIds,
  onDone,
}: {
  /** Set of job ids the user has ticked. */
  selectedIds: Set<string>;
  /** Called after a successful bulk-assign so the parent can clear
   *  the selection + refresh the table. */
  onDone: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<
    Array<{ id: string; full_name: string; avatar_url: string | null }> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || members !== null) return;
    let cancelled = false;
    void (async () => {
      const res = await loadAssignableMembersAction();
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMembers(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, members]);

  // Outside-click closes the popover.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function pick(recruiterId: string | null) {
    if (selectedIds.size === 0) return;
    start(async () => {
      const res = await bulkAssignRecruiterAction({
        jobIds: [...selectedIds],
        recruiterTeamMemberId: recruiterId,
      });
      if (!res.ok) {
        toast.actionFailed(t("jobsList.bulkAssignFailed"), res.error);
        return;
      }
      toast.actionOk(
        recruiterId === null
          ? t("jobsList.bulkUnassignedRecruiter", { count: res.data.updated })
          : t("jobsList.bulkAssignedRecruiter", { count: res.data.updated }),
      );
      setOpen(false);
      onDone();
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-fg-1 transition-colors hover:bg-bg-3"
      >
        <UserCircle2 className="h-3.5 w-3.5" />
        {t("jobsList.bulkAssignRecruiter")}
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-md border border-border bg-background py-1 shadow-modal">
          {members === null ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("jobsList.bulkLoadingMembers")}
            </div>
          ) : error ? (
            <p className="px-3 py-3 text-[11px] text-danger">{error}</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => pick(null)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                {t("jobsList.bulkUnassignRecruiter")}
              </button>
              <div className="border-t border-border" />
              <ul className="max-h-56 overflow-y-auto">
                {members.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => pick(m.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-muted",
                      )}
                    >
                      <Avatar src={m.avatar_url} name={m.full_name} size="xs" />
                      <span className="truncate">{m.full_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
