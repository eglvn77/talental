"use client";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NotesPanel } from "@/components/notes-panel";

type Props = {
  portalSlug: string;
  candidateSlug: string;
  candidateName: string;
  /** When set and > 0, a count badge renders on the trigger. */
  noteCount?: number;
  /**
   * "compact" — ghost size-6 button used in the row/card icon column.
   * "outlined" — bordered size-7 button matching the LinkedIn/email
   * actions in the candidate detail page header.
   */
  variant?: "compact" | "outlined";
};

export function NotesModalButton({
  portalSlug,
  candidateSlug,
  candidateName,
  noteCount,
  variant = "compact",
}: Props) {
  const hasCount = typeof noteCount === "number" && noteCount > 0;
  const ariaLabel = hasCount
    ? `Notes for ${candidateName} (${noteCount} existing)`
    : `Notes for ${candidateName}`;
  const title = hasCount
    ? `Add or view notes (${noteCount})`
    : "Add or view notes";

  return (
    <Dialog>
      <DialogTrigger asChild>
        {variant === "outlined" ? (
          <button
            type="button"
            aria-label={ariaLabel}
            title={title}
            className="relative inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <PencilLine className="size-3.5" />
            {hasCount ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-brand-foreground"
              >
                {noteCount}
              </span>
            ) : null}
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={ariaLabel}
            title={title}
            className="size-6 text-muted-foreground hover:text-foreground"
          >
            <PencilLine className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{candidateName}</DialogTitle>
          <p className="text-sm text-muted-foreground">Notes</p>
        </DialogHeader>
        <div className="overflow-y-auto pr-2" style={{ maxHeight: "calc(85vh - 8rem)" }}>
          <NotesPanel portalSlug={portalSlug} candidateSlug={candidateSlug} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
