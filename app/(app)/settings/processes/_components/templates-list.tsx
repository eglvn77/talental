"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  createProcessTemplateAction,
  deleteProcessTemplateAction,
  duplicateProcessTemplateAction,
} from "../../actions";
import { EditTemplateDialog } from "./edit-template-dialog";
import {
  TemplateCreateDialog,
  type TemplateCreateValues,
} from "./template-create-dialog";

export type TemplateListItem = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  auto_move_contacted_on_outbound: boolean;
  auto_move_answered_on_reply: boolean;
  stage_count: number;
};

export function TemplatesList({
  initialTemplates,
}: {
  initialTemplates: TemplateListItem[];
}) {
  const t = useT();
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TemplateListItem | null>(
    null,
  );
  const [, startTransition] = useTransition();

  function refresh() {
    router.refresh();
  }

  async function onCreateSubmit(v: TemplateCreateValues) {
    const res = await createProcessTemplateAction({
      name: v.name,
      description: v.description,
    });
    if (!res.ok) {
      toast.actionFailed(t("processesCfg.createFailed"), res.error);
      return;
    }
    toast.actionOk(t("processesCfg.processCreated"));
    // Jump straight into the new template's edit dialog — empty
    // templates aren't useful, the next thing you'll do is add stages.
    setEditingId(res.data.id);
    refresh();
  }

  function onDuplicate(tpl: TemplateListItem) {
    startTransition(async () => {
      const res = await duplicateProcessTemplateAction({ id: tpl.id });
      if (!res.ok) {
        toast.actionFailed(t("processesCfg.duplicateFailed"), res.error);
        return;
      }
      toast.actionOk(t("processesCfg.processDuplicated"));
      refresh();
    });
  }

  async function onDeleteConfirmed() {
    if (!confirmTarget) return;
    const res = await deleteProcessTemplateAction({ id: confirmTarget.id });
    if (!res.ok) {
      toast.actionFailed(t("processesCfg.deleteFailed"), res.error);
      return;
    }
    toast.actionOk(t("processesCfg.processDeleted"));
    setTemplates((cur) => cur.filter((x) => x.id !== confirmTarget.id));
    setConfirmTarget(null);
    refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("processesCfg.newProcess")}
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("processesCfg.emptyTemplates")}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(tpl.id)}
                    className="truncate text-left text-sm font-medium hover:underline"
                  >
                    {tpl.name}
                  </button>
                  {tpl.is_default ? (
                    <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      {t("processesCfg.default")}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {tpl.stage_count}{" "}
                  {tpl.stage_count === 1
                    ? t("processesCfg.stageSingular")
                    : t("processesCfg.stagePlural")}
                  {tpl.description ? (
                    <>
                      <span className="mx-1.5">·</span>
                      <span className="truncate">{tpl.description}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDuplicate(tpl)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("processesCfg.duplicate")}
                aria-label={t("processesCfg.duplicate")}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setEditingId(tpl.id)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("processesCfg.editProcess")}
                aria-label={t("processesCfg.edit")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmTarget(tpl)}
                disabled={tpl.is_default}
                className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                title={
                  tpl.is_default
                    ? t("processesCfg.cannotDeleteDefault")
                    : t("processesCfg.delete")
                }
                aria-label={t("processesCfg.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <TemplateCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={onCreateSubmit}
      />

      <EditTemplateDialog
        templateId={editingId}
        onOpenChange={(o) => {
          if (!o) setEditingId(null);
        }}
        onClosed={refresh}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title={
          confirmTarget
            ? t("processesCfg.deleteNamed", { name: confirmTarget.name })
            : t("processesCfg.deleteProcess")
        }
        description={t("processesCfg.deleteProcessDescription")}
        confirmLabel={t("processesCfg.delete")}
        destructive
        onConfirm={onDeleteConfirmed}
      />
    </>
  );
}
