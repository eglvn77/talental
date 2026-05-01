"use client";
import { useState, useTransition } from "react";
import { Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { togglePortalActiveAction } from "./portal-actions";

export function PortalToggleButton({
  portalId,
  isActive,
}: {
  portalId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runToggle(newState: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await togglePortalActiveAction(portalId, newState);
      if (!res.success) {
        setError(res.error);
      } else {
        setConfirmOpen(false);
      }
    });
  }

  function onClick() {
    if (isActive) {
      setConfirmOpen(true);
    } else {
      runToggle(true);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={pending}
        aria-label={isActive ? "Deactivate portal" : "Reactivate portal"}
        title={isActive ? "Deactivate portal" : "Reactivate portal"}
        onClick={onClick}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isActive ? (
          <ToggleRight className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate this portal?</DialogTitle>
            <DialogDescription>
              Clients with the link will see a &ldquo;no longer active&rdquo;
              message until you reactivate.
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
              onClick={() => runToggle(false)}
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Deactivating…
                </>
              ) : (
                "Deactivate"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StatusDot({
  isActive,
  expired,
}: {
  isActive: boolean;
  expired: boolean;
}) {
  let dotClass = "bg-emerald-500";
  let label = "Active";
  let labelClass = "text-foreground";
  if (!isActive) {
    dotClass = "bg-muted-foreground/40";
    label = "Inactive";
    labelClass = "text-muted-foreground";
  } else if (expired) {
    dotClass = "bg-amber-500";
    label = "Expired";
    labelClass = "text-muted-foreground";
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-block size-2 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span className={`text-xs ${labelClass}`}>{label}</span>
    </span>
  );
}
