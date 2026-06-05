"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  INITIATIVE_PRIORITIES,
  INITIATIVE_STATUSES,
  INITIATIVE_TYPES,
} from "@/lib/hiring/enums";
import type {
  InitiativePriority,
  InitiativeStatus,
  InitiativeType,
} from "@/lib/hiring/enums";
import type { AgentAreaRow, InitiativeRow } from "@/lib/hiring";
import type { AgentWithPrompt } from "../_loaders/load-org";
import {
  createInitiativeAction,
  deleteInitiativeAction,
  updateInitiativeAction,
} from "../_actions/initiatives";

export function InitiativeFormDialog({
  open,
  onOpenChange,
  initiative,
  areas,
  agents,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initiative: InitiativeRow | null;
  areas: AgentAreaRow[];
  agents: AgentWithPrompt[];
}) {
  const t = useT();
  const router = useRouter();
  const isEdit = initiative !== null;

  const [title, setTitle] = useState("");
  const [type, setType] = useState<InitiativeType>("feature");
  const [priority, setPriority] = useState<InitiativePriority>("P2");
  const [status, setStatus] = useState<InitiativeStatus>("idea");
  const [areaId, setAreaId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    if (initiative) {
      setTitle(initiative.title);
      setType(initiative.type as InitiativeType);
      setPriority((initiative.priority ?? "P2") as InitiativePriority);
      setStatus(initiative.status as InitiativeStatus);
      setAreaId(initiative.area_id ?? "");
      setAgentId(initiative.agent_id ?? "");
      setNotes(initiative.notes ?? "");
    } else {
      setTitle("");
      setType("feature");
      setPriority("P2");
      setStatus("idea");
      setAreaId("");
      setAgentId("");
      setNotes("");
    }
  }, [open, initiative]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      title: title.trim(),
      type,
      priority,
      status,
      area_id: areaId || null,
      agent_id: agentId || null,
      notes: notes.trim() || null,
    };
    const res = isEdit
      ? await updateInitiativeAction(initiative!.id, payload)
      : await createInitiativeAction(payload);
    setBusy(false);
    if (!res.ok) {
      toast.actionFailed(t("agentsArea.save"), res.error);
      return;
    }
    toast.actionOk(t("agentsArea.save"));
    onOpenChange(false);
    router.refresh();
  }

  function onDelete() {
    if (!initiative) return;
    start(async () => {
      const res = await deleteInitiativeAction(initiative.id);
      if (!res.ok) {
        toast.actionFailed("delete", res.error);
        return;
      }
      setConfirmDelete(false);
      onOpenChange(false);
      router.refresh();
    });
  }

  // Narrow agent list to the chosen area when one is picked.
  const agentOptions = areaId
    ? agents.filter((a) => a.area_id === areaId)
    : agents;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {isEdit
                ? t("agentsArea.initiativeTitle")
                : t("agentsArea.newInitiative")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3 px-5 pb-3 text-sm">
            <Field label={t("agentsArea.initiativeTitle")} required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("agentsArea.initiativeType")}>
                <Select
                  value={type}
                  onChange={(v) => setType(v as InitiativeType)}
                  options={INITIATIVE_TYPES.map((tp) => ({
                    value: tp,
                    label: t(`agentsArea.initType.${tp}`),
                  }))}
                />
              </Field>
              <Field label={t("agentsArea.initiativePriority")}>
                <Select
                  value={priority}
                  onChange={(v) => setPriority(v as InitiativePriority)}
                  options={INITIATIVE_PRIORITIES.map((p) => ({
                    value: p,
                    label: p,
                  }))}
                />
              </Field>
              <Field label={t("agentsArea.initiativeStatus")}>
                <Select
                  value={status}
                  onChange={(v) => setStatus(v as InitiativeStatus)}
                  options={INITIATIVE_STATUSES.map((s) => ({
                    value: s,
                    label: t(`agentsArea.initStatus.${s}`),
                  }))}
                />
              </Field>
              <Field label={t("agentsArea.initiativeArea")}>
                <Select
                  value={areaId}
                  onChange={(v) => {
                    setAreaId(v);
                    // Clear agent if it doesn't belong to the new area.
                    if (agentId) {
                      const a = agents.find((x) => x.id === agentId);
                      if (!a || a.area_id !== v) setAgentId("");
                    }
                  }}
                  options={[
                    { value: "", label: "—" },
                    ...areas.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              </Field>
              <Field label={t("agentsArea.initiativeAgent")}>
                <Select
                  value={agentId}
                  onChange={(v) => setAgentId(v)}
                  options={[
                    { value: "", label: "—" },
                    ...agentOptions.map((a) => ({
                      value: a.id,
                      label: a.name,
                    })),
                  ]}
                />
              </Field>
            </div>
            <Field label={t("agentsArea.initiativeNotes")}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              {isEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="gap-1.5 text-danger hover:bg-danger-soft/40 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  {t("agentsArea.cancel")}
                </Button>
                <Button type="submit" disabled={busy} className="gap-2">
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {busy ? t("agentsArea.saving") : t("agentsArea.save")}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(v) => !busy && setConfirmDelete(v)}
        title={`Delete "${initiative?.title ?? ""}"?`}
        description="This permanently removes the initiative."
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}
