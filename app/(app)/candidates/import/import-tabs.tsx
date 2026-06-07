"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ImportWizard } from "./import-wizard";
import { CvImportWizard } from "./cv-import-wizard";
import { useT } from "@/lib/i18n/client";

/**
 * Top-level tabs for /candidates/import.
 *
 *   PDFs  — drag-drop CVs, Gemini parses each, preview + bulk save.
 *           This is the primary flow for the "lunes" rollout.
 *
 *   CSV   — column-mapping wizard (talent-pool import without
 *           enrichment). Existing implementation.
 */
type Tab = "cv" | "csv";

export function ImportTabs({ mapsApiKey }: { mapsApiKey: string }) {
  const searchParams = useSearchParams();
  // When ?tab= is explicit in URL (the add-candidates host pushes
  // ?tab=csv when the recruiter picks CSV), lock the page to that
  // method and hide the tab row entirely. Each method has its own
  // entry point now — the picker decides; this page just executes.
  const explicitTab = searchParams.get("tab");
  const locked = explicitTab === "csv" || explicitTab === "cv";
  const initialTab: Tab = explicitTab === "csv" ? "csv" : "cv";
  // Vacante context — when the import was opened from a job, CSV rows
  // attach to that job (at the chosen stage) instead of the pool. Source
  // is the one picked in the add-candidates flow.
  const jobId = searchParams.get("job") || undefined;
  const stageId = searchParams.get("stage") || undefined;
  const initialSource = searchParams.get("source") || undefined;
  const [tab, setTab] = useState<Tab>(initialTab);
  const t = useT();
  // If the URL ?tab= changes (e.g. user clicks the dropdown again),
  // honor it. Internal tab clicks just update local state without
  // touching the URL — keeps refresh-friendly without history spam.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const effective = locked ? initialTab : tab;

  return (
    <div className="space-y-5">
      {/* Tabs row only renders when the user landed here without an
          explicit method (legacy direct links from candidate profile).
          Host-driven entries lock the method. */}
      {!locked ? (
        <div
          role="tablist"
          aria-label={t("candidatesArea.importTypeAriaLabel")}
          className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs"
        >
          <TabButton current={tab} value="cv" label={t("candidatesArea.tabPdfs")} onClick={setTab} />
          <TabButton current={tab} value="csv" label={t("candidatesArea.tabCsv")} onClick={setTab} />
        </div>
      ) : null}

      {effective === "cv" ? (
        <CvImportWizard mapsApiKey={mapsApiKey} />
      ) : (
        <ImportWizard
          jobId={jobId}
          stageId={stageId}
          initialSource={initialSource}
        />
      )}
    </div>
  );
}

function TabButton({
  current,
  value,
  label,
  onClick,
}: {
  current: Tab;
  value: Tab;
  label: string;
  onClick: (t: Tab) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(value)}
      className={cn(
        "rounded px-3 py-1.5 transition-colors",
        active
          ? "bg-foreground/[0.07] font-medium text-foreground"
          : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
