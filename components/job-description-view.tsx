import { sanitizeReportHtml } from "@/lib/report-html";
import { ReportBody } from "@/components/report-body";

export function JobDescriptionView({ html }: { html: string | null }) {
  const trimmed = typeof html === "string" ? html.trim() : "";
  if (!trimmed) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
        Job description not available.
      </p>
    );
  }
  return <ReportBody html={sanitizeReportHtml(trimmed)} className="max-w-none" />;
}
