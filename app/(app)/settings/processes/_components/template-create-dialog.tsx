"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

export type TemplateCreateValues = {
  name: string;
  description: string | null;
};

/**
 * Minimal create dialog — just name + description. Default / automations
 * are configured inline on the detail page after the template exists,
 * which keeps this dialog snappy and avoids duplicating the autosaving
 * form on the detail page.
 */
export function TemplateCreateDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: TemplateCreateValues) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name, description: description.trim() || null });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("processesCfg.newProcess")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="tpl-create-name" className="text-xs font-medium">
              {t("processesCfg.name")}
            </label>
            <Input
              id="tpl-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("processesCfg.namePlaceholder")}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="tpl-create-desc" className="text-xs font-medium">
              {t("processesCfg.description")}{" "}
              <span className="text-muted-foreground">
                {t("processesCfg.optional")}
              </span>
            </label>
            <Input
              id="tpl-create-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("processesCfg.descriptionPlaceholder")}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("processesCfg.createHint")}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("processesCfg.cancel")}
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("processesCfg.create")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
