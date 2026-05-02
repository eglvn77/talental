"use client";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { deletePortalLinkAction } from "./portal-actions";

export function DeletePortalButton({
  portalId,
  clientName,
}: {
  portalId: string;
  clientName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deletePortalLinkAction(portalId);
      if (!res.success) {
        setError(res.error);
      } else {
        setConfirmOpen(false);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:border-red-300 hover:text-red-600"
        aria-label="Delete portal link"
        title="Delete portal link"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this portal link?</DialogTitle>
            <DialogDescription>
              This will permanently remove the link for{" "}
              <span className="font-medium text-foreground">{clientName}</span>.
              The URL will stop working immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={runDelete}
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
