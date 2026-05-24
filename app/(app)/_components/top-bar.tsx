"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PanelLeft, Search } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { cn } from "@/lib/utils";

/**
 * Detects whether the user is on a Mac so the search trigger shows
 * the right shortcut hint (⌘K vs Ctrl K). Mirrors the hook in
 * search-command.tsx — duplicated here so this component doesn't
 * pull a transitive import chain through SearchCommand.
 */
function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua =
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
    setIsMac(/Mac|iPhone|iPod|iPad/i.test(ua));
  }, []);
  return isMac;
}

/**
 * Global top bar that spans the whole viewport above the sidebar
 * and content. Contains:
 *
 *   - Brand wordmark (links to /jobs)
 *   - Sidebar collapse/expand toggle (dispatches `tlt:toggle-
 *     sidebar` — the sidebar listens and flips its own state +
 *     localStorage)
 *   - Centred search trigger (dispatches `tlt:open-search` — the
 *     SearchCommand palette listens)
 *
 * This is the convention used by ATS / CRM tools (Lever, Greenhouse,
 * HubSpot, Pipedrive): global search lives in a top bar so the rail
 * can be pure navigation. Cmd+K still opens the palette directly.
 */
export function TopBar() {
  const isMac = useIsMac();

  function toggleSidebar() {
    window.dispatchEvent(new Event("tlt:toggle-sidebar"));
  }

  function openSearch() {
    window.dispatchEvent(new Event("tlt:open-search"));
  }

  return (
    <header
      // Sticky so the search + brand stay reachable as the page
      // scrolls. z-30 sits above the sidebar (z-auto) and content,
      // below the search dialog overlay (z-50).
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border-1 bg-bg-2 px-4"
    >
      {/* Sidebar toggle — single direction-agnostic icon. The actual
          chevron-direction affordance lives inside the sidebar's own
          header so users have a hint both places. */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Mostrar / ocultar barra"
        title="Mostrar / ocultar barra"
        className="rounded p-1.5 text-fg-muted transition-colors hover:bg-bg-3 hover:text-fg-1"
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      <Link href="/jobs" aria-label="Talental — inicio" className="shrink-0">
        <Wordmark size="md" />
      </Link>

      {/* Search trigger — protagonic centre-left element. Same
          tinted-pill treatment as the old in-sidebar trigger, just
          wider and anchored in the top bar where ATS / CRM users
          expect to find search. Cmd+K opens the same palette. */}
      <div className="ml-2 flex flex-1 justify-start">
        <button
          type="button"
          onClick={openSearch}
          className={cn(
            "flex h-9 w-full max-w-[480px] items-center gap-2 rounded-md border border-border-soft bg-bg-3 px-3 text-sm text-fg-muted transition-colors hover:bg-bg-1 hover:text-fg-1",
          )}
        >
          <Search className="h-4 w-4" />
          <span>Buscar vacantes, candidatos, empresas…</span>
          <kbd
            suppressHydrationWarning
            className="ml-auto inline-flex items-center gap-0.5 rounded border border-border-soft bg-bg-1 px-1.5 py-0.5 font-mono text-[11px] leading-none text-fg-2"
          >
            <span>{isMac ? "⌘" : "Ctrl"}</span>
            <span>K</span>
          </kbd>
        </button>
      </div>
    </header>
  );
}
