"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  applyTagAction,
  createTagAction,
  listTagsAction,
  removeTagAction,
} from "../../actions";

type Tag = { id: string; name: string; color: string | null };

export function TagPicker({
  entityType,
  entityId,
  appliedTags,
  revalidatePath,
}: {
  entityType: "candidate" | "application";
  entityId: string;
  appliedTags: Tag[];
  revalidatePath: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allTags, setAllTags] = useState<Tag[] | null>(null);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || allTags !== null) return;
    listTagsAction().then((res) => {
      if (res.ok) setAllTags(res.data);
    });
  }, [open, allTags]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const appliedIds = new Set(appliedTags.map((t) => t.id));
  const q = query.trim().toLowerCase();
  const candidates = (allTags ?? []).filter(
    (t) => !appliedIds.has(t.id) && (!q || t.name.toLowerCase().includes(q)),
  );
  const exactMatch = (allTags ?? []).find(
    (t) => t.name.toLowerCase() === q,
  );

  function apply(tagId: string) {
    setQuery("");
    setOpen(false);
    startTransition(async () => {
      const res = await applyTagAction({
        tagId,
        entityType,
        entityId,
        revalidate: revalidatePath,
      });
      if (res.ok) router.refresh();
    });
  }

  function createAndApply(name: string) {
    setQuery("");
    setOpen(false);
    startTransition(async () => {
      const created = await createTagAction(name);
      if (!created.ok) return;
      // Cache locally so picker shows it immediately.
      setAllTags((prev) =>
        prev
          ? [
              ...prev,
              {
                id: created.data.tagId,
                name: created.data.name,
                color: created.data.color,
              },
            ]
          : prev,
      );
      const res = await applyTagAction({
        tagId: created.data.tagId,
        entityType,
        entityId,
        revalidate: revalidatePath,
      });
      if (res.ok) router.refresh();
    });
  }

  function remove(tagId: string) {
    startTransition(async () => {
      const res = await removeTagAction({
        tagId,
        entityType,
        entityId,
        revalidate: revalidatePath,
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex flex-wrap items-center gap-1.5">
        {appliedTags.map((t) => (
          <span
            key={t.id}
            className="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
            style={{
              background: (t.color ?? "#94a3b8") + "22",
              color: t.color ?? "#475569",
              border: `1px solid ${t.color ?? "#94a3b8"}55`,
            }}
          >
            {t.name}
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label={`Quitar ${t.name}`}
              className="opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Etiqueta
        </button>
      </div>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-md border border-border bg-background shadow-dropdown">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q && !exactMatch) {
                e.preventDefault();
                createAndApply(query);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Buscar o crear…"
            className="w-full rounded-t-md border-b border-border bg-transparent px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {candidates.length === 0 && !q ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {allTags === null ? "Cargando…" : "Sin etiquetas todavía."}
              </div>
            ) : null}
            {candidates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => apply(t.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: t.color ?? "#94a3b8" }}
                />
                {t.name}
              </button>
            ))}
            {q && !exactMatch ? (
              <button
                type="button"
                onClick={() => createAndApply(query)}
                className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear &ldquo;{query}&rdquo;
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
