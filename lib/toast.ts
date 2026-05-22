"use client";

import { toast as sonner } from "sonner";

/**
 * Workspace-wide toast contract. Keeps copy and severity consistent
 * so every "save failed" / "X actualizado" message looks the same.
 *
 * Use these helpers (saved/saveFailed/actionOk/actionFailed) for new
 * code. The .success/.error passthroughs to sonner are kept for
 * backwards compatibility — existing call sites can be migrated
 * gradually.
 */

export const toast = {
  /** Generic "saved" confirmation. */
  saved(label = "Guardado") {
    sonner.success(label);
  },

  /** "No se pudo guardar" + the action's error string as description. */
  saveFailed(error: string) {
    sonner.error("No se pudo guardar", { description: error });
  },

  /** Specific success message (created, deleted, applied, etc.). */
  actionOk(label: string, description?: string) {
    sonner.success(label, description ? { description } : undefined);
  },

  /** Specific error — title is the action that failed, description is the cause. */
  actionFailed(label: string, description?: string) {
    sonner.error(label, description ? { description } : undefined);
  },

  /** Neutral informational toast. */
  info(label: string, description?: string) {
    sonner(label, description ? { description } : undefined);
  },

  // ---------- Backwards-compatible passthroughs ----------
  // Migrate these calls to the helpers above as you touch each file.
  success: sonner.success.bind(sonner),
  error: sonner.error.bind(sonner),
  message: sonner.bind(sonner),
};
