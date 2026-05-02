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

export function NotesModalButton({
  portalSlug,
  candidateSlug,
  candidateName,
}: {
  portalSlug: string;
  candidateSlug: string;
  candidateName: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Notes for ${candidateName}`}
          title="Add or view notes"
          className="size-6 text-muted-foreground hover:text-foreground"
        >
          <PencilLine className="size-4" />
        </Button>
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
