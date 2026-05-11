"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "../../../_components/rich-text-editor";
import { updateJobAction } from "../../../actions";

export function DescriptionEditor({
  jobId,
  initialHtml,
}: {
  jobId: string;
  initialHtml: string;
}) {
  const [html, setHtml] = useState(initialHtml);
  const [savedHtml, setSavedHtml] = useState(initialHtml);
  const [error, setError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = html !== savedHtml;

  // Auto-hide "Guardado" indicator after 3s.
  useEffect(() => {
    if (!showSaved) return;
    const t = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(t);
  }, [showSaved]);

  function onSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateJobAction({
        jobId,
        publicDescription: html,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedHtml(html);
      setShowSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        {showSaved ? (
          <span className="text-xs text-green-700">Guardado</span>
        ) : dirty ? (
          <span className="text-xs text-muted-foreground">
            Cambios sin guardar
          </span>
        ) : null}
        <Button onClick={onSave} disabled={isPending || !dirty}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Editor
          </div>
          <RichTextEditor
            value={html}
            onChange={setHtml}
            placeholder="Empieza a escribir la descripción del puesto…"
          />
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Vista previa
          </div>
          <div className="min-h-[200px] rounded-md border border-border bg-background p-4">
            {html ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                La vista previa aparece aquí.
              </p>
            )}
          </div>
        </div>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
