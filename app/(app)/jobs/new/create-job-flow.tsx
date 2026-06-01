"use client";

import { useState } from "react";
import { ChevronRight, PencilLine, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { NewJobForm, type ProcessTemplateOption } from "./new-job-form";
import { IntakeFirstForm } from "./intake-first-form";

type Mode = "manual" | "intake";

/**
 * Entry point for the create-vacante modal. Before any data capture the
 * recruiter picks HOW to create the vacante:
 *  - "manual": the classic slim form (title / company / location /
 *    pipeline), then the post-create kickoff chooser.
 *  - "intake": pick only company + pipeline, paste the intake, and let
 *    the kickoff infer the title/location and generate the package.
 */
export function CreateJobFlow({
  templates,
}: {
  templates: ProcessTemplateOption[];
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode | null>(null);

  if (mode === "manual") {
    return <NewJobForm templates={templates} onBack={() => setMode(null)} />;
  }
  if (mode === "intake") {
    return (
      <IntakeFirstForm templates={templates} onBack={() => setMode(null)} />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("jobsList.chooserQuestion")}
      </p>
      <ModeCard
        icon={<Sparkles className="h-4 w-4" />}
        title={t("jobsList.chooserIntake")}
        desc={t("jobsList.chooserIntakeDesc")}
        accent
        onClick={() => setMode("intake")}
      />
      <ModeCard
        icon={<PencilLine className="h-4 w-4" />}
        title={t("jobsList.chooserManual")}
        desc={t("jobsList.chooserManualDesc")}
        onClick={() => setMode("manual")}
      />
    </div>
  );
}

function ModeCard({
  icon,
  title,
  desc,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors " +
        (accent
          ? "border-accent/40 bg-accent-soft/40 hover:bg-accent-soft/70"
          : "border-border hover:bg-bg-2")
      }
    >
      <span
        className={
          "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md " +
          (accent
            ? "bg-accent text-fg-on-accent"
            : "bg-bg-3 text-muted-foreground")
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {desc}
        </span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
