"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useListNav } from "@/lib/use-list-nav";
import {
  createContactAction,
  searchContactsAction,
} from "@/app/(app)/contacts/actions";

/**
 * Searchable picker over hiring.contacts with inline-create.
 *
 *   - Type → debounced search across full_name + email.
 *   - Click a result → selected.
 *   - Type a name that isn't in the DB → the dropdown shows a "Crear
 *     '<typed>'" affordance. Clicking it calls createContactAction,
 *     mounts the new row as the selection, refreshes nothing else.
 *
 * The component is uncontrolled-with-callback — it manages its own
 * `query` + `selected` state and fires `onChange` with the chosen
 * (or freshly-created) contact. Pass `defaultContact` to rehydrate
 * an existing selection (used by the settings card).
 */

export type ContactComboboxValue = {
  id: string;
  full_name: string;
  email: string | null;
};

export function ContactCombobox({
  name,
  defaultContact = null,
  placeholder = "Buscar contacto…",
  onChange,
  disabled,
}: {
  /** Form name — emits a hidden input so FormData picks it up. */
  name: string;
  defaultContact?: ContactComboboxValue | null;
  placeholder?: string;
  onChange?: (contact: ContactComboboxValue | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ContactComboboxValue[]>([]);
  const [selected, setSelected] = useState<ContactComboboxValue | null>(
    defaultContact,
  );
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced DB search.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      startSearch(async () => {
        const res = await searchContactsAction(query, 10);
        if (ctrl.signal.aborted) return;
        if (res.ok) setOptions(res.data);
      });
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  // Click-outside to close.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(c: ContactComboboxValue | null) {
    setSelected(c);
    setQuery(c?.full_name ?? "");
    setOpen(false);
    onChange?.(c);
  }

  // Keyboard navigation across the options list. Enter on a
  // highlighted row picks; if there's no highlight (no options or
  // user hasn't arrowed yet), the existing "Enter creates" path
  // below stays as the fallback.
  const { highlight, setHighlight, onKeyDown: navKeys } = useListNav(
    options,
    pick,
  );

  const handleCreate = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setCreating(true);
      setCreateError(null);
      const res = await createContactAction({ fullName: trimmed });
      setCreating(false);
      if (!res.ok) {
        setCreateError(res.error);
        return;
      }
      const created: ContactComboboxValue = {
        id: res.data.contactId,
        full_name: trimmed,
        email: null,
      };
      pick(created);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const exactHit = options.find(
    (o) => o.full_name.toLowerCase() === query.trim().toLowerCase(),
  );
  const canCreate =
    query.trim().length > 1 && !exactHit && !creating;

  return (
    <div ref={wrapRef} className="relative">
      <Input
        ref={inputRef}
        type="text"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          // Typing invalidates a prior selection — user is searching
          // again. Clear the hidden field too so submit doesn't carry
          // a stale id.
          if (selected) {
            setSelected(null);
            onChange?.(null);
          }
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          // If there are options and the user has arrowed onto one,
          // delegate to navKeys (Enter picks). When the list is empty
          // (or highlight is past the end), Enter falls through to
          // "create from the typed name".
          if (options.length > 0) {
            // ArrowUp/Down + Enter on a real option → pick it.
            if (
              e.key === "ArrowUp" ||
              e.key === "ArrowDown" ||
              (e.key === "Enter" && options[highlight])
            ) {
              navKeys(e);
              return;
            }
          }
          if (e.key === "Enter" && canCreate) {
            e.preventDefault();
            void handleCreate(query);
          }
        }}
      />
      <input
        type="hidden"
        name={name}
        value={selected?.id ?? ""}
      />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-bg-1 py-1 shadow-dropdown">
          {isSearching && options.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              Buscando…
            </div>
          ) : null}
          {options.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-xs transition-colors",
                i === highlight ? "bg-bg-3" : "hover:bg-bg-3",
              )}
            >
              <span className="font-medium text-fg-1">{c.full_name}</span>
              {c.email ? (
                <span className="ml-2 text-fg-muted">{c.email}</span>
              ) : null}
            </button>
          ))}
          {canCreate ? (
            <button
              type="button"
              onClick={() => void handleCreate(query)}
              disabled={creating}
              className="flex w-full items-center gap-2 border-t border-border-soft px-3 py-2 text-left text-xs text-accent hover:bg-bg-3 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Crear &ldquo;{query.trim()}&rdquo;
            </button>
          ) : null}
          {options.length === 0 && !isSearching && !canCreate ? (
            <div className="px-3 py-2 text-xs text-fg-muted">
              Sin resultados
            </div>
          ) : null}
          {createError ? (
            <p className="border-t border-border-soft px-3 py-1.5 text-[10px] text-danger">
              {createError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
