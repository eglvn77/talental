"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Controlled confirm dialog. Replaces native `confirm()` calls so
 * confirmations are keyboard-friendly, themable, and consistent with
 * the rest of the app's Dialog components.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="..."
 *     description="..."
 *     destructive
 *     onConfirm={async () => { ... }}
 *   />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Continuar",
  cancelLabel = "Cancelar",
  destructive = false,
  requireConfirmationText,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * When set, the user must type this exact string into an input
   * before the confirm button enables. Use for high-blast-radius
   * deletes (GitHub-style "type the name to confirm"). Match is
   * trimmed + case-sensitive.
   */
  requireConfirmationText?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [internalBusy, setInternalBusy] = useState(false);
  const busy = pending || internalBusy;

  // Typed-confirmation state. Reset whenever the dialog opens/closes
  // so a previous attempt's text never carries over.
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const needsText = Boolean(requireConfirmationText);
  const textMatches =
    !needsText || typed.trim() === (requireConfirmationText ?? "").trim();

  function handleConfirm() {
    setInternalBusy(true);
    const maybe = onConfirm();
    if (maybe instanceof Promise) {
      startTransition(async () => {
        try {
          await maybe;
        } finally {
          setInternalBusy(false);
        }
      });
    } else {
      setInternalBusy(false);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {needsText ? (
          <div className="space-y-1.5 pt-1">
            <label className="text-xs text-muted-foreground">
              Escribe{" "}
              <span className="font-mono font-medium text-foreground">
                {requireConfirmationText}
              </span>{" "}
              para confirmar:
            </label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && textMatches && !busy) handleConfirm();
              }}
              autoFocus
              placeholder={requireConfirmationText}
              className="h-9 text-sm"
            />
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !textMatches}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              destructive
                ? "bg-danger text-white hover:bg-danger/90"
                : "bg-accent text-fg-on-accent hover:bg-accent/90",
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
