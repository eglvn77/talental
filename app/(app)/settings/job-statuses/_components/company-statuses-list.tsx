"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as Dialog from "@radix-ui/react-dialog";
import { GripVertical, Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import type { CompanyStatusRow } from "@/lib/hiring";
import {
  createWorkspaceCompanyStatusAction,
  deleteWorkspaceCompanyStatusAction,
  reorderWorkspaceCompanyStatusesAction,
  updateWorkspaceCompanyStatusAction,
} from "../../actions";

/**
 * Workspace company-status manager. Mirrors JobStatusesList — a drag-
 * reorderable list with inline label + color editors and a create
 * dialog — but company statuses have NO behavior/funnel concept and NO
 * system lock: every row is fully editable and deletable. The only
 * delete guards (in-use, last-remaining) live server-side.
 */
export function CompanyStatusesList({
  initialStatuses,
  usageCounts,
}: {
  initialStatuses: CompanyStatusRow[];
  /** companies count per status KEY. Display-only hint + delete guard. */
  usageCounts: Record<string, number>;
}) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initialStatuses);
  useEffect(() => setRows(initialStatuses), [initialStatuses]);
  const [, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyStatusRow | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function applyLocalPatch(id: string, patch: Partial<CompanyStatusRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function commitReorder(next: CompanyStatusRow[]) {
    setRows(next);
    startTransition(async () => {
      const res = await reorderWorkspaceCompanyStatusesAction({
        orderedIds: next.map((r) => r.id),
      });
      if (!res.ok) toast.actionFailed(t("jobStatusesCfg.reorderFailed"), res.error);
      router.refresh();
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    commitReorder(arrayMove(rows, oldIndex, newIndex));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[24px_1fr_88px_28px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
          <span aria-hidden />
          <span>{t("jobStatusesCfg.columnName")}</span>
          <span>{t("jobStatusesCfg.columnColor")}</span>
          <span aria-hidden />
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <Row
                  key={r.id}
                  row={r}
                  t={t}
                  onLocalPatch={(p) => applyLocalPatch(r.id, p)}
                  onAskDelete={() => setDeleteTarget(r)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setCreateOpen(true)}
        className="gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("jobStatusesCfg.addStatus")}
      </Button>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => (!o ? setDeleteTarget(null) : null)}
        title={t("jobStatusesCfg.deleteTitle", {
          label: deleteTarget?.label ?? "",
        })}
        description={
          deleteTarget && (usageCounts[deleteTarget.key] ?? 0) > 0
            ? t("jobStatusesCfg.deleteCompanyInUse", {
                count: usageCounts[deleteTarget.key],
              })
            : t("jobStatusesCfg.deleteUndoable")
        }
        confirmLabel={t("jobStatusesCfg.deleteConfirm")}
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          const res = await deleteWorkspaceCompanyStatusAction({
            id: deleteTarget.id,
          });
          setDeleteTarget(null);
          if (!res.ok) {
            toast.actionFailed(t("jobStatusesCfg.deleteFailed"), res.error);
            return;
          }
          toast.actionOk(t("jobStatusesCfg.companyStatusDeleted"));
          router.refresh();
        }}
      />
    </div>
  );
}

function Row({
  row,
  t,
  onLocalPatch,
  onAskDelete,
}: {
  row: CompanyStatusRow;
  t: TFunction;
  onLocalPatch: (p: Partial<CompanyStatusRow>) => void;
  onAskDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [name, setName] = useState(row.label);
  useEffect(() => setName(row.label), [row.label]);
  const lastSavedName = useRef(row.label);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(lastSavedName.current);
      toast.actionFailed(t("jobStatusesCfg.nameEmpty"));
      return;
    }
    if (trimmed === lastSavedName.current) return;
    const res = await updateWorkspaceCompanyStatusAction({
      id: row.id,
      label: trimmed,
    });
    if (!res.ok) {
      toast.actionFailed(t("jobStatusesCfg.saveFailed"), res.error);
      setName(lastSavedName.current);
      return;
    }
    lastSavedName.current = trimmed;
    onLocalPatch({ label: trimmed });
  }

  async function commitColor(next: string) {
    const prev = row.color;
    onLocalPatch({ color: next });
    const res = await updateWorkspaceCompanyStatusAction({
      id: row.id,
      color: next,
    });
    if (!res.ok) {
      toast.actionFailed(t("jobStatusesCfg.saveFailed"), res.error);
      onLocalPatch({ color: prev });
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_1fr_88px_28px] items-center gap-2 bg-background px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("jobStatusesCfg.reorder")}
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: row.color ?? "#94a3b8" }}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(lastSavedName.current);
              (e.target as HTMLInputElement).blur();
            }
          }}
          maxLength={40}
          className="h-8 text-sm"
        />
      </div>

      <input
        type="color"
        value={row.color ?? "#94a3b8"}
        onChange={(e) => void commitColor(e.target.value)}
        aria-label={t("jobStatusesCfg.colorOf", { label: row.label })}
        className="h-7 w-12 cursor-pointer rounded-md border border-border bg-background p-0.5"
      />

      <button
        type="button"
        onClick={onAskDelete}
        aria-label={t("jobStatusesCfg.deleteStatusAria", { label: row.label })}
        title={t("jobStatusesCfg.deleteCompanyStatusTitle")}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/** Create-status dialog: name + color. No behavior (company statuses
 *  are flat classifications). */
function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const t = useT();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#94a3b8");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel("");
      setColor("#94a3b8");
      setSubmitting(false);
    }
  }, [open]);

  async function submit() {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.actionFailed(t("jobStatusesCfg.nameRequired"));
      return;
    }
    setSubmitting(true);
    const res = await createWorkspaceCompanyStatusAction({
      label: trimmed,
      color,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.actionFailed(t("jobStatusesCfg.createFailed"), res.error);
      return;
    }
    toast.actionOk(t("jobStatusesCfg.companyStatusCreated"));
    onCreated();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-5 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {t("jobStatusesCfg.newCompanyStatusTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t("jobStatusesCfg.newCompanyStatusDescription")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("jobStatusesCfg.close")}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("jobStatusesCfg.nameLabel")}
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={40}
                placeholder={t("jobStatusesCfg.companyNamePlaceholder")}
                autoFocus
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("jobStatusesCfg.colorLabel")}
              </label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label={t("jobStatusesCfg.color")}
                className="h-9 w-16 cursor-pointer rounded-md border border-border bg-background p-0.5"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" size="sm" variant="outline">
                {t("jobStatusesCfg.cancel")}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              size="sm"
              onClick={() => void submit()}
              disabled={submitting || !label.trim()}
              className={cn("gap-1", submitting && "opacity-70")}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t("jobStatusesCfg.createStatus")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
