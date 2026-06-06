"use client";

import { useEffect } from "react";

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
