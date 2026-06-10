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
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

export type TemplateValues = {
  name: string;
  subject: string | null;
  content: string;
};

/**
 * One dialog for both create and edit. `initial` undefined = create
 * mode (empty fields); otherwise the fields pre-fill for editing. The
 * content field is a plain textarea — there is no Textarea primitive in
 * components/ui, so it borrows the Input focus-ring styling.
 */
export function TemplateDialog({
  open,
  initial,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initial?: TemplateValues;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: TemplateValues) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setSubject(initial?.subject ?? "");
    setContent(initial?.content ?? "");
  }, [open, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        subject: subject.trim() || null,
        content,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? t("templatesCfg.editTitle") : t("templatesCfg.newTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="tpl-name" className="text-xs font-medium">
              {t("common.name")}
            </label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("templatesCfg.namePlaceholder")}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="tpl-subject" className="text-xs font-medium">
              {t("templatesCfg.subject")}{" "}
              <span className="text-muted-foreground">{t("common.optional")}</span>
            </label>
            <Input
              id="tpl-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("templatesCfg.subjectPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="tpl-content" className="text-xs font-medium">
              {t("templatesCfg.content")}
            </label>
            <textarea
              id="tpl-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("templatesCfg.contentPlaceholder")}
              required
              rows={12}
              className={cn(
                "flex min-h-[180px] w-full rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm transition-[color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !content.trim()}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("common.save")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
