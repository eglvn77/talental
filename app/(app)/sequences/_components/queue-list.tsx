"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { cancelQueueItemAction, retryQueueItemAction } from "../../_actions/sequences";

export type QueueListItem = {
  id: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  attempts: number;
  error: string | null;
  sequenceName: string;
  contactName: string;
};

const STATUS_OPTIONS = ["pending", "processing", "completed", "failed", "cancelled"];

/** Shared list for the Queue and Errors tabs. */
export function QueueList({
  items,
  activeStatus,
  mode,
}: {
  items: QueueListItem[];
  activeStatus: string | null;
  mode: "queue" | "errors";
}) {
  return (
    <div>
      {mode === "queue" ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {STATUS_OPTIONS.map((s) => (
            <Link
              key={s}
              href={`/sequences?tab=queue&status=${s}`}
              className={`rounded-full border px-2.5 py-0.5 text-xs capitalize ${
                activeStatus === s
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </Link>
          ))}
          {activeStatus ? (
            <Link href="/sequences?tab=queue" className="text-xs text-muted-foreground underline">
              Clear
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 overflow-hidden rounded-md border border-border bg-card">
        {items.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {mode === "queue" ? "Queue is empty. No items in the queue." : "No errors."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Sequence</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">{mode === "errors" ? "Error" : "Scheduled"}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <Row key={item.id} item={item} mode={mode} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Row({ item, mode }: { item: QueueListItem; mode: "queue" | "errors" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const res = await retryQueueItemAction({ queueId: item.id });
      if (!res.ok) {
        toast.actionFailed("Couldn't retry", res.error);
        return;
      }
      toast.actionOk("Re-queued");
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelQueueItemAction({ queueId: item.id });
      if (!res.ok) {
        toast.actionFailed("Couldn't cancel", res.error);
        return;
      }
      toast.actionOk("Cancelled");
      router.refresh();
    });
  }

  return (
    <tr className="hover:bg-muted/50">
      <td className="px-3 py-2.5 font-medium">{item.contactName}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{item.sequenceName}</td>
      <td className="px-3 py-2.5">
        <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs">
          {item.type}
        </span>
        {item.attempts > 1 ? (
          <span className="ml-1.5 text-xs text-muted-foreground">×{item.attempts}</span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {mode === "errors"
          ? (item.error ?? "(unknown error)").slice(0, 120)
          : item.scheduledAt
            ? new Date(item.scheduledAt).toLocaleString("es-MX", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
      </td>
      <td className="px-3 py-2.5 text-right">
        {pending ? (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
        ) : mode === "errors" ? (
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        ) : item.status === "pending" ? (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            <XCircle className="h-3 w-3" />
            Cancel
          </button>
        ) : null}
      </td>
    </tr>
  );
}
