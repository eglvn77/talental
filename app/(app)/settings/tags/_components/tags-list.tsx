"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  createTagAction,
  deleteTagAction,
  updateTagAction,
} from "../../../actions";

export type TagListItem = {
  id: string;
  name: string;
  color: string | null;
  usageCount: number;
};

/**
 * Workspace tag manager. Each row = one tag: inline-editable name +
 * color picker + delete (with usage-aware confirm). New tags via the
 * "Agregar etiqueta" button at the bottom. Optimistic-ish: we commit
 * per field and router.refresh to re-sync from the server.
 */
export function TagsList({ initialTags }: { initialTags: TagListItem[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialTags);
  useEffect(() => setRows(initialTags), [initialTags]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TagListItem | null>(null);

  async function onCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const res = await createTagAction(name);
    setCreating(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo crear", res.error);
      return;
    }
    setNewName("");
    toast.actionOk("Etiqueta creada");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Aún no hay etiquetas. Crea una abajo, o aparecen
          automáticamente al etiquetar un candidato.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="hidden grid-cols-[1fr_88px_120px_28px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
            <span>Nombre</span>
            <span>Color</span>
            <span>Uso</span>
            <span aria-hidden />
          </div>
          <ul className="divide-y divide-border">
            {rows.map((t) => (
              <TagRow
                key={t.id}
                tag={t}
                onAskDelete={() => setDeleteTarget(t)}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onCreate();
          }}
          placeholder="Nueva etiqueta…"
          maxLength={40}
          className="h-8 max-w-xs text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void onCreate()}
          disabled={creating || !newName.trim()}
          className="gap-1"
        >
          {creating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Agregar etiqueta
        </Button>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => (!o ? setDeleteTarget(null) : null)}
        title={`Eliminar "${deleteTarget?.name ?? ""}"`}
        description={
          deleteTarget && deleteTarget.usageCount > 0
            ? `Esta etiqueta está aplicada en ${deleteTarget.usageCount} lugar(es). Eliminarla la quitará de todos. No se puede deshacer.`
            : "Esta acción no se puede deshacer."
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          const res = await deleteTagAction({ tagId: deleteTarget.id });
          setDeleteTarget(null);
          if (!res.ok) {
            toast.actionFailed("No se pudo eliminar", res.error);
            return;
          }
          toast.actionOk("Etiqueta eliminada");
          router.refresh();
        }}
      />
    </div>
  );
}

function TagRow({
  tag,
  onAskDelete,
}: {
  tag: TagListItem;
  onAskDelete: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(tag.name);
  useEffect(() => setName(tag.name), [tag.name]);
  const lastSaved = useRef(tag.name);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(lastSaved.current);
      toast.actionFailed("El nombre no puede estar vacío");
      return;
    }
    if (trimmed === lastSaved.current) return;
    const res = await updateTagAction({ tagId: tag.id, name: trimmed });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      setName(lastSaved.current);
      return;
    }
    lastSaved.current = trimmed;
    router.refresh();
  }

  async function commitColor(next: string) {
    const res = await updateTagAction({ tagId: tag.id, color: next });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="grid grid-cols-[1fr_88px_120px_28px] items-center gap-2 bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {/* Live color swatch so the row reads as the chip it produces. */}
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: tag.color ?? "#94a3b8" }}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(lastSaved.current);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 text-sm"
        />
      </div>

      <input
        type="color"
        value={tag.color ?? "#94a3b8"}
        onChange={(e) => void commitColor(e.target.value)}
        aria-label={`Color de ${tag.name}`}
        className="h-7 w-12 cursor-pointer rounded-md border border-border bg-background p-0.5"
      />

      <span className="text-xs text-muted-foreground">
        {tag.usageCount} {tag.usageCount === 1 ? "uso" : "usos"}
      </span>

      <button
        type="button"
        onClick={onAskDelete}
        aria-label={`Eliminar ${tag.name}`}
        title="Eliminar etiqueta"
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
