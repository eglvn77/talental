"use client";
import { FileUser } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReportBody } from "@/components/report-body";

export function ReportModalButton({
  candidateName,
  reportHtml,
}: {
  candidateName: string;
  reportHtml: string | null;
}) {
  const enabled = Boolean(reportHtml);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!enabled}
          aria-label={enabled ? "Read candidate report" : "No report yet"}
          title={enabled ? "Read candidate report" : "No report yet"}
          className="size-6 text-muted-foreground hover:text-foreground"
        >
          <FileUser className="size-4" />
        </Button>
      </DialogTrigger>
      {enabled ? (
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{candidateName}</DialogTitle>
            <p className="text-sm text-muted-foreground">Candidate report</p>
          </DialogHeader>
          <div className="overflow-y-auto pr-2" style={{ maxHeight: "calc(85vh - 8rem)" }}>
            <ReportBody html={reportHtml ?? ""} />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
