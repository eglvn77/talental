"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { diffLines } from "diff";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { restorePromptVersionAction } from "../../actions";
import { useDialogShortcuts } from "@/lib/use-dialog-shortcuts";

/**
 * Prompt version history viewer. A drawer-style overlay opens from
 * the right side of the prompt editor and lists every saved version
 * newest-first (rows captured by the `prompts_snapshot_version`
 * trigger). Selecting a version opens a side-by-side line-level
 * diff against the current live body — red strikethrough for
 * removed lines, green for added — so the recruiter can see exactly
 * what changed before deciding to restore.
 *
 * Restore writes the chosen version's body+model back onto the
 * prompts row. The trigger then snapshots the pre-restore state as
 * a fresh version, so a restore is itself reversible.
 */
export type VersionEntry = {
  id: string;
  version_number: number;
  body: string;
  model: string;
  edited_by_team_member_id: string | null;
  edited_by_name: string | null;
  created_at: string;
};

export function PromptHistoryButton({
  promptId,
  currentBody,
  versions,
}: {
  promptId: string;
  currentBody: string;
  versions: VersionEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<VersionEntry | null>(null);
  const [pending, start] = useTransition();

  useDialogShortcuts({
    enabled: open,
    onCancel: () => {
      if (selected) {
        setSelected(null);
      } else if (!pending) {
        setOpen(false);
      }
    },
  });

  function onRestore(v: VersionEntry) {
    if (!confirm(`Restore version v${v.version_number}? The current content becomes a new version, so this is reversible.`)) {
      return;
    }
    start(async () => {
      const res = await restorePromptVersionAction({
        promptId,
        versionId: v.id,
      });
      if (!res.ok) {
        toast.actionFailed("Restore", res.error);
        return;
      }
      toast.actionOk(`Restored v${v.version_number}`);
      setOpen(false);
      setSelected(null);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Version history"
        aria-label="Version history"
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <History className="h-3.5 w-3.5" />
        History
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="flex h-full w-full max-w-3xl flex-col border-l border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {selected
                    ? `v${selected.version_number} vs current`
                    : "Version history"}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {selected
                    ? "Red = removed · Green = added"
                    : `${versions.length} saved version${versions.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  selected ? setSelected(null) : setOpen(false)
                }
                disabled={pending}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {selected ? (
              <DiffView
                oldBody={selected.body}
                newBody={currentBody}
                version={selected}
                onBack={() => setSelected(null)}
                onRestore={() => onRestore(selected)}
                pending={pending}
              />
            ) : (
              <ul className="flex-1 divide-y divide-border overflow-y-auto">
                {versions.length === 0 ? (
                  <li className="p-6 text-center text-xs text-muted-foreground">
                    No saved versions yet.
                  </li>
                ) : (
                  versions.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(v)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-xs text-muted-foreground">
                            v{v.version_number}
                          </span>
                          <span className="font-medium">
                            {formatDateTime(v.created_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {v.edited_by_name ?? "—"} ·{" "}
                          <span className="font-mono">{v.model}</span> ·{" "}
                          {v.body.length.toLocaleString()} chars
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRestore(v)}
                        disabled={pending}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function DiffView({
  oldBody,
  newBody,
  version,
  onBack,
  onRestore,
  pending,
}: {
  oldBody: string;
  newBody: string;
  version: VersionEntry;
  onBack: () => void;
  onRestore: () => void;
  pending: boolean;
}) {
  // diffLines returns the change set as ordered parts. Each part is
  // either unchanged, added (in newBody), or removed (only in old).
  // For our restore comparison: oldBody = the saved version,
  // newBody = the current live body. So "added" lines are in the
  // current that weren't in the version (= what'd be removed by
  // restoring), and "removed" are in the version but not current
  // (= what'd come back).
  const parts = useMemo(() => diffLines(oldBody, newBody), [oldBody, newBody]);
  return (
    <>
      <div className="border-b border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        Restoring v{version.version_number} would{" "}
        <span className="text-rose-700">remove</span> what's green and{" "}
        <span className="text-emerald-700">bring back</span> what's red.
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
          {parts.map((p, i) => (
            <span
              key={i}
              className={
                p.added
                  ? "bg-emerald-100/60 text-emerald-900"
                  : p.removed
                    ? "bg-rose-100/60 text-rose-900 line-through"
                    : ""
              }
            >
              {p.value}
            </span>
          ))}
        </pre>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to list
        </button>
        <button
          type="button"
          onClick={onRestore}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Restore v{version.version_number}
        </button>
      </div>
    </>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
