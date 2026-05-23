"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Autosave form values to localStorage so the user can close the tab,
 * crash, or navigate away mid-fill and pick the form back up where
 * they left it.
 *
 * Contract:
 *   - `key` namespaces the draft. Use a stable per-form id
 *     (`tlt_draft.jobs.new`, `tlt_draft.jobs.edit.<jobId>`, etc).
 *   - `initial` is the *fresh* default — used the very first time the
 *     user opens the form, AND after `clear()` is called on successful
 *     submit.
 *   - The hook returns `[values, setValues, { hadDraft, clear, savedAt }]`.
 *     `hadDraft` lets you show "Borrador restaurado" UX. `savedAt` is
 *     the ISO timestamp of the last write, useful for a "guardado hace
 *     5 s" hint.
 *
 * Writes are debounced — every `setValues` call resets a 500 ms timer
 * before persisting, so rapid typing doesn't bombard localStorage.
 */
export function useFormDraft<T extends object>(
  key: string,
  initial: T,
): readonly [
  T,
  (next: T | ((prev: T) => T)) => void,
  { hadDraft: boolean; clear: () => void; savedAt: string | null },
] {
  const [values, setValuesState] = useState<T>(initial);
  const [hadDraft, setHadDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate on mount. We use a ref so we only attempt this once;
  // React Strict Mode would otherwise re-run the effect and re-hydrate.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { v: T; at: string };
        if (parsed && typeof parsed === "object" && "v" in parsed) {
          setValuesState(parsed.v);
          setHadDraft(true);
          if (typeof parsed.at === "string") setSavedAt(parsed.at);
        }
      }
    } catch {
      /* corrupt storage — fall through to initial */
    }
  }, [key]);

  const setValues = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValuesState((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        // Debounce the write so a burst of keystrokes only persists
        // once. Last-write-wins.
        if (debounceRef.current != null) {
          window.clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(() => {
          try {
            const at = new Date().toISOString();
            window.localStorage.setItem(key, JSON.stringify({ v, at }));
            setSavedAt(at);
          } catch {
            /* quota / private mode — silent */
          }
        }, 500);
        return v;
      });
    },
    [key],
  );

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setHadDraft(false);
    setSavedAt(null);
  }, [key]);

  return [values, setValues, { hadDraft, clear, savedAt }] as const;
}
