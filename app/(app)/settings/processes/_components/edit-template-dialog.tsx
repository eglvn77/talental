"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ProcessTemplateRow,
  ProcessTemplateStageRow,
} from "@/lib/hiring/rows";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import { loadProcessTemplateForEditAction } from "../../actions";
import { StagesEditor } from "./stages-editor";
import { TemplateSettingsForm } from "./template-settings-form";

/**
 * One-stop modal for editing a process template — settings + stages,
 * both in the same surface. Replaces the old `/settings/processes/[id]`
 * full page (which felt too big for what's really a config tweak).
 *
 * Data flow:
 * - Fetches the template + stages + isOnlyTemplate flag on open.
 * - Child components mutate via their own server actions; the dialog
 *   keeps a local mirror of the template (for the count / default flag
 *   to stay fresh as the admin toggles things) and the stages list.
 * - On close, the parent list calls router.refresh() so the row outside
 *   the dialog also reflects the updated name, default, and stage_count.
 */
export function EditTemplateDialog({
  templateId,
  onOpenChange,
  onClosed,
}: {
  templateId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Fires once when the dialog closes — caller refreshes the list. */
  onClosed?: () => void;
}) {
  const t = useT();
  const open = templateId !== null;
  const [data, setData] = useState<{
    template: ProcessTemplateRow;
    stages: ProcessTemplateStageRow[];
    isOnlyTemplate: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep the latest onOpenChange in a ref so the load effect can call it
  // on error WITHOUT depending on it. Depending on the prop made the
  // effect re-run whenever the parent re-rendered (e.g. after a stage
  // rename triggers revalidatePath), which reloaded the whole modal.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!templateId) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    void (async () => {
      const res = await loadProcessTemplateForEditAction({ id: templateId });
      if (!alive) return;
      if (!res.ok) {
        toast.actionFailed(t("processesCfg.loadFailed"), res.error);
        onOpenChangeRef.current(false);
        setLoading(false);
        return;
      }
      setData(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // Only reload when the template being edited changes — NOT on every
    // parent re-render. `t` and onOpenChange are read via refs/stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) onClosed?.();
  }

  function patchTemplate(patch: Partial<ProcessTemplateRow>) {
    setData((cur) =>
      cur ? { ...cur, template: { ...cur.template, ...patch } } : cur,
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Dialog max-h is 85vh by default; we let the inner shell handle
          its own overflow so the header sticks while the body scrolls. */}
      <DialogContent className="flex max-h-[85vh] w-full max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3.5">
          <DialogTitle className="text-base">
            {data
              ? `${t("processesCfg.editProcess")} · ${data.template.name}`
              : t("processesCfg.editProcess")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {loading || !data ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <>
              <TemplateSettingsForm
                template={data.template}
                isOnlyTemplate={data.isOnlyTemplate}
                onChanged={patchTemplate}
              />

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">
                  {t("processesCfg.stages")}
                </h3>
                <StagesEditor
                  templateId={data.template.id}
                  initialStages={data.stages}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
