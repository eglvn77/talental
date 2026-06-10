"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  createMessageTemplateAction,
  deleteMessageTemplateAction,
  updateMessageTemplateAction,
} from "../actions";
import { TemplateDialog, type TemplateValues } from "./template-dialog";

export type TemplateListItem = {
  id: string;
  name: string;
  subject: string | null;
  content: string;
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
  const [editing, setEditing] = useState<TemplateListItem | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TemplateListItem | null>(
    null,
  );

  function refresh() {
    router.refresh();
  }

  async function onCreateSubmit(v: TemplateValues) {
    const res = await createMessageTemplateAction(v);
    if (!res.ok) {
      toast.actionFailed(t("templatesCfg.createFailed"), res.error);
      return;
    }
    toast.actionOk(t("templatesCfg.created"));
    refresh();
  }

  async function onEditSubmit(v: TemplateValues) {
    if (!editing) return;
    const res = await updateMessageTemplateAction({ id: editing.id, ...v });
    if (!res.ok) {
      toast.actionFailed(t("templatesCfg.updateFailed"), res.error);
      return;
    }
    toast.actionOk(t("templatesCfg.updated"));
    refresh();
  }

  async function onDeleteConfirmed() {
    if (!confirmTarget) return;
    const res = await deleteMessageTemplateAction({ id: confirmTarget.id });
    if (!res.ok) {
      toast.actionFailed(t("templatesCfg.deleteFailed"), res.error);
      return;
    }
    toast.actionOk(t("templatesCfg.deleted"));
    setTemplates((cur) => cur.filter((x) => x.id !== confirmTarget.id));
    setConfirmTarget(null);
    refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          {t("templatesCfg.newTemplate")}
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("templatesCfg.empty")}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {templates.map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setEditing(tpl)}
                  className="truncate text-left text-sm font-medium hover:underline"
                >
                  {tpl.name}
                </button>
                <div className="truncate text-xs text-muted-foreground">
                  {tpl.subject ? (
                    <span className="truncate">{tpl.subject}</span>
                  ) : (
                    <span className="italic">{t("templatesCfg.noSubject")}</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditing(tpl)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("common.edit")}
                aria-label={t("common.edit")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmTarget(tpl)}
                className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                title={t("common.delete")}
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <TemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={onCreateSubmit}
      />

      <TemplateDialog
        open={editing !== null}
        initial={
          editing
            ? {
                name: editing.name,
                subject: editing.subject,
                content: editing.content,
              }
            : undefined
        }
        onOpenChange={(o) => !o && setEditing(null)}
        onSubmit={onEditSubmit}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title={
          confirmTarget
            ? t("templatesCfg.deleteNamed", { name: confirmTarget.name })
            : t("templatesCfg.deleteTitle")
        }
        description={t("templatesCfg.deleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={onDeleteConfirmed}
      />
    </>
  );
}
