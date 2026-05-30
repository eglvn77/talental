"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";

/**
 * Floating bar that appears at the bottom of the viewport when one
 * or more rows are selected in a list table. Lives at the bottom-
 * centre so it doesn't compete with the page's main content while
 * still being unmissable.
 *
 * The default delete button is wired here (with a confirm dialog
 * destructive style); callers can pass extra `children` for entity-
 * specific actions like "Aplicar tag" or "Cambiar estado".
 *
 * Usage:
 *   const [selected, setSelected] = useState<Set<string>>(new Set());
 *   <BulkActionsBar
 *     selectedCount={selected.size}
 *     onClear={() => setSelected(new Set())}
 *     entityLabel="candidato"
 *     onDelete={async () => { await bulkDeleteAction([...selected]); }}
 *   />
 */
export function BulkActionsBar({
  selectedCount,
  onClear,
  entityLabel,
  onDelete,
  children,
}: {
  selectedCount: number;
  onClear: () => void;
  /**
   * Singular noun used to phrase the confirmation copy. The bar
   * itself pluralises for the count.
   */
  entityLabel: string;
  /** Bulk-delete handler — called after the user confirms. */
  onDelete: () => Promise<void> | void;
  /** Optional extra action buttons rendered to the left of Delete. */
  children?: React.ReactNode;
}) {
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (selectedCount === 0) return null;

  // Count-aware copy: choose the singular or plural key in JS rather
  // than appending an "s", which only works in Spanish.
  const isOne = selectedCount === 1;
  const selectedLabel = t(
    isOne ? "shared.bulkSelected" : "shared.bulkSelected_plural",
    { count: selectedCount },
  );
  const confirmTitle = t(
    isOne ? "shared.bulkDeleteTitle" : "shared.bulkDeleteTitle_plural",
    { count: selectedCount, entity: entityLabel },
  );

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-bg-1 px-3 py-1.5 shadow-modal">
          <button
            type="button"
            onClick={onClear}
            aria-label={t("shared.bulkClear")}
            title={t("shared.bulkClear")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg-3 hover:text-fg-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-medium tabular-nums">
            {selectedLabel}
          </span>
          <span className="h-4 w-px bg-border" />
          {children}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
            className="gap-1.5 text-danger hover:bg-danger-soft/40 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("shared.bulkDelete")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => !deleting && setConfirmOpen(o)}
        title={confirmTitle}
        description={t("shared.bulkDeleteDescription")}
        confirmLabel={t("shared.bulkDelete")}
        destructive
        onConfirm={async () => {
          setDeleting(true);
          try {
            await onDelete();
            setConfirmOpen(false);
            onClear();
          } finally {
            setDeleting(false);
          }
        }}
      />
    </>
  );
}

/**
 * Checkbox cell helper — keeps every table's selection column visually
 * identical without each one re-inventing the markup. Renders a
 * single checkbox styled to match the design system; the parent owns
 * the selection set.
 */
export function SelectionCheckbox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className="h-4 w-4 cursor-pointer rounded border-border accent-accent"
    />
  );
}
