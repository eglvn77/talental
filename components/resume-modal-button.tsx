"use client";
import { Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ResumeModalButton({
  portalSlug,
  candidateSlug,
  candidateName,
}: {
  portalSlug: string;
  candidateSlug: string;
  candidateName: string;
}) {
  const resumeUrl = `/api/portal/${portalSlug}/candidates/${candidateSlug}/resume`;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="View resume"
          title="View resume"
          className="size-6 text-muted-foreground hover:text-foreground"
        >
          <Files className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{candidateName}</DialogTitle>
          <p className="text-sm text-muted-foreground">Resume</p>
        </DialogHeader>
        <iframe
          src={`${resumeUrl}#toolbar=1&navpanes=0&view=FitH`}
          title={`Resume for ${candidateName}`}
          className="h-[75vh] w-full rounded-md border border-border bg-background"
        />
      </DialogContent>
    </Dialog>
  );
}
