"use client";

import { useEffect } from "react";

/**
 * Esc clears the current selection. Mount on the table / kanban /
 * list view with `enabled={selected.size > 0}` so the listener only
 * attaches when there's something to clear. Stops propagation so a
 * higher-level Esc handler (e.g. a slideover) doesn't fire too.
 *
 * Per product rule: Esc never navigates back from the main sections
 * (jobs / candidates / companies / contacts). They are the last
 * layer — Esc only undoes the in-page state (closes a dialog or
 * clears a selection), never the route.
 */
export function useEscToClearSelection({
  enabled,
  clear,
}: {
  enabled: boolean;
  clear: () => void;
}): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Don't interfere with text-editing: native Escape behaviour
      // inside an input/textarea/contenteditable should stay.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      e.stopPropagation();
      clear();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, clear]);
}

/**
 * Cmd+Enter (Mac) / Ctrl+Enter (Win+Linux) → onSubmit.
 * Esc → onCancel.
 *
 * Mount inside any dialog/popover with `enabled={open}` so the
 * listeners only attach while it's visible. Both handlers are
 * optional — pass only the one you want.
 *
 * The submit listener fires on Enter EVEN when focus is in a
 * <textarea>, which is normally a soft-newline. That's intentional:
 * most of our dialogs have a single textarea + a Submit button, and
 * Cmd/Ctrl+Enter is the standard "send" shortcut (Slack, GitHub,
 * Discord, etc).
 */
export function useDialogShortcuts({
  enabled,
  onSubmit,
  onCancel,
}: {
  enabled: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
}): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && onCancel) {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
        e.preventDefault();
        e.stopPropagation();
        onSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onSubmit, onCancel]);
}
