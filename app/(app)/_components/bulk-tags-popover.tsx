"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Minus, Plus, TagIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import {
  bulkAddTagAction,
  bulkRemoveTagAction,
  listTagsAction,
} from "../actions";

/**
 * Floating "Tags" button for the BulkActionsBar. Lets the user add
 * OR remove a single workspace tag against every selected row in
 * one round-trip. Tags load lazily on first open (workspace-scoped,
 * shared across all entity types).
 *
 * Semantically distinct from BulkCustomFieldPopover: that one writes
 * one value per row (last-write-wins). This one mutates set
 * membership (additive or subtractive). Different mental model →
 * separate component, separate button.
 */
type TagRow = { id: string; name: string; color: string | null };

type Mode = "add" | "remove";

export function BulkTagsPopover({
  entityType,
  selectedIds,
  onDone,
}: {
  entityType: "candidate" | "job" | "company" | "contact";
  selectedIds: Set<string>;
  onDone: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [tags, setTags] = useState<TagRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || tags !== null) return;
    let cancelled = false;
    void (async () => {
      const res = await listTagsAction();
      if (cancelled) return;
      if (res.ok) setTags(res.data);
      else setTags([]); // surface noTags state on error too — keeps UI moving
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tags]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setMode("add");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const filtered = useMemo(() => {
    if (!tags) return [];
    if (!search.trim()) return tags;
    const q = search.toLowerCase();
    return tags.filter((tg) => tg.name.toLowerCase().includes(q));
  }, [tags, search]);

  function pick(tagId: string) {
    if (selectedIds.size === 0) return;
    start(async () => {
      const ids = [...selectedIds];
      const res =
        mode === "add"
          ? await bulkAddTagAction(entityType, ids, tagId)
          : await bulkRemoveTagAction(entityType, ids, tagId);
      if (!res.ok) {
        toast.actionFailed(t("bulkTags.actionFailed"), res.error);
        return;
      }
      toast.actionOk(
        t(mode === "add" ? "bulkTags.addedToast" : "bulkTags.removedToast", {
          count: res.data.updated,
        }),
      );
      setOpen(false);
      onDone();
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-fg-1 transition-colors hover:bg-bg-3"
      >
        <TagIcon className="h-3.5 w-3.5" />
        {t("bulkTags.trigger")}
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-md border border-border bg-background shadow-modal">
          <div className="flex border-b border-border">
            <ModeButton
              active={mode === "add"}
              onClick={() => setMode("add")}
              icon={<Plus className="h-3 w-3" />}
              label={t("bulkTags.addMode")}
            />
            <ModeButton
              active={mode === "remove"}
              onClick={() => setMode("remove")}
              icon={<Minus className="h-3 w-3" />}
              label={t("bulkTags.removeMode")}
            />
          </div>
          {tags === null ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("bulkField.loadingOptions")}
            </div>
          ) : tags.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">
              {t("bulkTags.noTags")}
            </p>
          ) : (
            <>
              {tags.length > 8 ? (
                <div className="border-b border-border p-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("bulkField.searchOptions")}
                    autoFocus
                    className="h-7 text-xs"
                  />
                </div>
              ) : null}
              <ul className="max-h-56 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-[11px] text-muted-foreground">
                    {t("bulkField.noMatches")}
                  </li>
                ) : (
                  filtered.map((tg) => (
                    <li key={tg.id}>
                      <button
                        type="button"
                        onClick={() => pick(tg.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: tg.color ?? "#807866" }}
                        />
                        <span className="truncate">{tg.name}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-[11px] transition-colors",
        active
          ? "border-b-2 border-accent text-foreground"
          : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
