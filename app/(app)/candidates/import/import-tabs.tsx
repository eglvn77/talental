"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ImportWizard } from "./import-wizard";
import { CvImportWizard } from "./cv-import-wizard";

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
  const initialTab: Tab = searchParams.get("tab") === "csv" ? "csv" : "cv";
  const [tab, setTab] = useState<Tab>(initialTab);
  // If the URL ?tab= changes (e.g. user clicks the dropdown again),
  // honor it. Internal tab clicks just update local state without
  // touching the URL — keeps refresh-friendly without history spam.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Tipo de import"
        className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs"
      >
        <TabButton current={tab} value="cv" label="PDFs (CVs)" onClick={setTab} />
        <TabButton current={tab} value="csv" label="CSV con mapping" onClick={setTab} />
      </div>

      {tab === "cv" ? <CvImportWizard mapsApiKey={mapsApiKey} /> : <ImportWizard />}
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
