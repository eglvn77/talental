import { cn } from "@/lib/utils";

// Maps stage names to colors that progress from neutral (early funnel) to
// green (advanced). Lookup is case-insensitive substring; if no rule matches,
// we fall back to the brand color so unknown stages still look intentional.
export function classesForStage(stage: string): string {
  const s = stage.toLowerCase();
  if (/(won|hired|offer accepted|placed)/.test(s)) {
    return "bg-emerald-600 text-white";
  }
  if (/(client interview|sent to client|client offer)/.test(s)) {
    return "bg-amber-500 text-white";
  }
  if (/(interview|talental interview)/.test(s)) {
    return "bg-violet-500 text-white";
  }
  if (/(contacted|engaged|screening)/.test(s)) {
    return "bg-sky-500 text-white";
  }
  if (/(sourced|new|applied)/.test(s)) {
    return "bg-slate-300 text-slate-800";
  }
  if (/(rejected|dropped|lost|withdrawn|not interested)/.test(s)) {
    return "bg-rose-200 text-rose-900";
  }
  return "bg-brand text-brand-foreground";
}

export function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        classesForStage(stage),
      )}
    >
      {stage}
    </span>
  );
}
