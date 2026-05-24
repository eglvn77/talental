"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PanelLeft, Search } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Mark } from "@/components/brand/Mark";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "./sidebar-state";
import { GlobalCreateMenu } from "./global-create-menu";

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
 * Global top bar — full-width, sticky. Two visual zones:
 *
 *   ┌──────────────┬─────────────────────────────────────┐
 *   │ [≡] Talental.│  [🔍 Buscar …  ⌘K]      [ + Nuevo ] │
 *   ├──────────────┼─────────────────────────────────────┤
 *   │ sidebar      │ content                              │
 *
 * The left zone shrink-grows in lockstep with the sidebar (w-44
 * expanded, w-14 collapsed) so the brand always sits over the rail
 * and the search/create live in the content column. Eliminates the
 * old asymmetry where the top bar didn't respect the sidebar grid.
 *
 * Reading order — brand (identity, far left) → search (primary
 * discovery, centre) → create (action, far right) — is the standard
 * ATS / CRM pattern (Lever, Greenhouse, HubSpot, Pipedrive).
 *
 * Cmd+K still opens the palette directly; the visible pill is just
 * the discovery affordance.
 */
export function TopBar() {
  const isMac = useIsMac();
  const { collapsed, toggle } = useSidebarCollapsed();

  function openSearch() {
    window.dispatchEvent(new Event("tlt:open-search"));
  }

  return (
    <header
      // Sticky so the search + brand stay reachable as the page
      // scrolls. z-30 sits above the sidebar (z-auto) and content,
      // below the search dialog overlay (z-50).
      className="sticky top-0 z-30 flex h-14 shrink-0 items-stretch border-b border-border-1 bg-bg-2"
    >
      {/* LEFT ZONE — brand + toggle, width matches sidebar. The
          inset shadow on the right reproduces the sidebar's right
          divider so the two surfaces read as one continuous column. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 px-3 shadow-[inset_-1px_0_0_var(--border-1)] transition-[width] duration-150",
          collapsed ? "w-14 justify-center px-2" : "w-44",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir barra" : "Colapsar barra"}
          title={collapsed ? "Expandir barra" : "Colapsar barra"}
          className="rounded p-1.5 text-fg-muted transition-colors hover:bg-bg-3 hover:text-fg-1"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        {!collapsed ? (
          <Link
            href="/jobs"
            aria-label="Talental — inicio"
            className="shrink-0"
          >
            <Wordmark size="md" />
          </Link>
        ) : (
          // Collapsed: the toggle alone fills the 56-px column. The
          // Mark goes inside the search/content row at the start so
          // the brand never disappears entirely — same x-position
          // logic many ATS dashboards use when their rail compacts.
          null
        )}
      </div>

      {/* RIGHT ZONE — search + create. Flex-1 so it eats remaining
          horizontal space. */}
      <div className="flex flex-1 items-center gap-3 px-4">
        {collapsed ? (
          <Link href="/jobs" aria-label="Talental — inicio" className="shrink-0">
            <Mark size="md" />
          </Link>
        ) : null}

        <button
          type="button"
          onClick={openSearch}
          className="flex h-9 w-full max-w-[480px] items-center gap-2 rounded-md border border-border-soft bg-bg-3 px-3 text-sm text-fg-muted transition-colors hover:bg-bg-1 hover:text-fg-1"
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

        {/* "+ Nuevo" anchored to the right of the top bar. */}
        <div className="ml-auto">
          <GlobalCreateMenu />
        </div>
      </div>
    </header>
  );
}
