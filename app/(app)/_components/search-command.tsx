"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Briefcase,
  Building2,
  Loader2,
  Search,
  UserSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  globalSearchAction,
  type GlobalSearchHit,
} from "@/app/(app)/actions";

type HitWithKey = GlobalSearchHit & { key: string };

const TYPE_META: Record<
  GlobalSearchHit["type"],
  { label: string; Icon: typeof Briefcase }
> = {
  job: { label: "Vacantes", Icon: Briefcase },
  company: { label: "Empresas", Icon: Building2 },
  candidate: { label: "Candidatos", Icon: UserSearch },
};

/**
 * Global Cmd+K search. Mounted once at the (app) layout level; exposes
 * an open() handler via the SearchTrigger button rendered in the
 * sidebar and listens for ⌘K / Ctrl+K everywhere in the app.
 */
export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<HitWithKey[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Global hotkey.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("tlt:open-search" as never, (() =>
      setOpen(true)) as never);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tlt:open-search" as never, (() =>
        setOpen(true)) as never);
    };
  }, []);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setHighlight(0);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearchAction(q);
        if (!res.ok) {
          setHits([]);
          return;
        }
        const next: HitWithKey[] = res.data.hits.map((h) => ({
          ...h,
          key: `${h.type}:${h.id}`,
        }));
        setHits(next);
        setHighlight(0);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setHighlight(0);
    } else {
      // Autofocus after the dialog mounts.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Group hits by type, preserving server order.
  const grouped = useMemo(() => {
    const map = new Map<GlobalSearchHit["type"], HitWithKey[]>();
    for (const h of hits) {
      const arr = map.get(h.type) ?? [];
      arr.push(h);
      map.set(h.type, arr);
    }
    const order: GlobalSearchHit["type"][] = ["job", "company", "candidate"];
    return order
      .map((t) => ({ type: t, items: map.get(t) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [hits]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const navigate = useCallback(
    (hit: HitWithKey) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[highlight];
      if (hit) navigate(hit);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className="fixed left-1/2 top-[15%] z-50 w-full max-w-2xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-background shadow-modal outline-none focus-visible:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Buscar vacantes, empresas, candidatos…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : null}
            <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              esc
            </kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto py-2">
            {query.trim().length < 2 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Empieza a escribir para buscar.
              </p>
            ) : flat.length === 0 && !pending ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Sin resultados.
              </p>
            ) : (
              grouped.map((group) => {
                const Icon = TYPE_META[group.type].Icon;
                return (
                  <div key={group.type} className="mb-2 last:mb-0">
                    <div className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {TYPE_META[group.type].label}
                    </div>
                    {group.items.map((hit) => {
                      const idx = flat.findIndex((f) => f.key === hit.key);
                      const active = idx === highlight;
                      return (
                        <button
                          key={hit.key}
                          type="button"
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => navigate(hit)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                            active ? "bg-muted" : "hover:bg-muted/50",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{hit.title}</div>
                            {hit.subtitle ? (
                              <div className="truncate text-xs text-muted-foreground">
                                {hit.subtitle}
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Button that opens the search dialog. Lives in the sidebar.
 */
export function SearchTrigger({ collapsed }: { collapsed: boolean }) {
  function open() {
    window.dispatchEvent(new Event("tlt:open-search"));
  }
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={open}
        className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Buscar"
        title="Buscar (⌘K)"
      >
        <Search className="h-4 w-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Search className="h-3.5 w-3.5" />
      <span>Buscar</span>
      <kbd className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
        ⌘K
      </kbd>
    </button>
  );
}
