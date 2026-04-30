import { cn } from "@/lib/utils";

// Renders pre-sanitized candidate report HTML in the Talental typography
// container. The sanitizer strips style/class attributes from the source HTML,
// so these classes have a clear field — they fully control the look.
//
// Type scale (per spec):
//   body  14px   leading-normal (1.5)
//   h1    20px
//   h2    17px
//   h3    15px
//   list-item line-height ~1.5 (was 1.7 with leading-relaxed)
export function ReportBody({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "report-prose mx-auto max-w-[700px] text-sm leading-normal text-foreground",
        "[&_p]:my-2.5 [&_p]:font-sans [&_p]:leading-normal",
        "[&_h1]:mt-5 [&_h1]:mb-2.5 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:mt-5 [&_h2]:mb-2.5 [&_h2]:text-[17px] [&_h2]:font-semibold",
        "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-[15px] [&_h3]:font-semibold",
        "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul_li]:my-0.5 [&_ul_li]:leading-normal",
        "[&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol_li]:my-0.5 [&_ol_li]:leading-normal",
        "[&_strong]:font-semibold [&_b]:font-semibold",
        "[&_em]:italic [&_i]:italic",
        "[&_a]:text-brand [&_a]:underline-offset-2 hover:[&_a]:underline",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-5 [&_hr]:border-border",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]",
        className,
      )}
      // Sanitization is done server-side via sanitizeReportHtml — never call this with raw HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
