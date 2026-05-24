"use client";

import { useEffect, useState } from "react";

/**
 * Shared collapsed state for the sidebar, accessible from both the
 * <AdminSidebar> and the <TopBar>. Persisted to localStorage; sync'd
 * across components via a custom event so either surface can flip the
 * state and both rerender in lockstep.
 */

const STORAGE_KEY = "tlt_sidebar_collapsed";
const EVENT = "tlt:sidebar-collapsed-changed";

function readStored(): boolean | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return null;
}

function initialCollapsed(): boolean {
  const stored = readStored();
  if (stored !== null) return stored;
  // No explicit preference → collapse on small viewports by default.
  try {
    return window.matchMedia("(max-width: 767px)").matches;
  } catch {
    return false;
  }
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(initialCollapsed());
    function onChange(e: Event) {
      const detail = (e as CustomEvent<boolean>).detail;
      setCollapsed(detail);
    }
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
      return next;
    });
  }

  return { collapsed, toggle };
}
