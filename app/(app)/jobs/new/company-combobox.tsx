"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type CompanyStatus } from "@/lib/hiring";
import { useListNav } from "@/lib/use-list-nav";
import {
  createCompanyAction,
  searchCompaniesAction,
} from "../../actions";

type CompanyOption = {
  id: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  status: CompanyStatus;
};

export function CompanyCombobox({
  defaultCompany = null,
  onChange,
}: {
  defaultCompany?: CompanyOption | null;
  onChange?: (company: CompanyOption | null) => void;
} = {}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [selected, setSelected] = useState<CompanyOption | null>(
    defaultCompany,
  );
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Local DB search.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchCompaniesAction(query, 10);
        if (ctrl.signal.aborted) return;
        if (res.ok) setOptions(res.data);
      });
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(c: CompanyOption) {
    setSelected(c);
    setOpen(false);
    setQuery("");
    onChange?.(c);
  }

  function clearSelection() {
    setSelected(null);
    setOpen(true);
    onChange?.(null);
  }

  // Keyboard navigation: ↑/↓ moves through `options`, Enter picks.
  // Highlight resets to 0 whenever the filtered options change.
  const { highlight, setHighlight, onKeyDown: navKeys } = useListNav(
    options,
    pick,
  );

  return (
    <div className="relative" ref={wrapRef}>
      {selected ? (
        <button
          type="button"
          onClick={clearSelection}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
        >
          <span className="flex-1">{selected.name}</span>
          {selected.domain ? (
            <span className="text-xs text-muted-foreground">
              {selected.domain}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">cambiar</span>
        </button>
      ) : (
        <Input
          placeholder="Busca una empresa…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            navKeys(e);
          }}
        />
      )}

      <input type="hidden" name="company_id" value={selected?.id ?? ""} />

      {open && !selected ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-background shadow-dropdown">
          {options.length > 0 ? (
            <>
              <div className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Tus empresas
              </div>
              {options.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    i === highlight ? "bg-muted" : "hover:bg-muted",
                  )}
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.domain ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {c.domain}
                    </span>
                  ) : null}
                </button>
              ))}
            </>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {query.trim().length < 2
                ? "Escribe al menos 2 caracteres para buscar."
                : "Sin coincidencias."}
            </div>
          )}

          {createError ? (
            <p className="border-t border-border px-3 py-1.5 text-xs text-danger">
              {createError}
            </p>
          ) : null}

          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Crear nuevo cliente
              {query.trim() ? (
                <span className="text-muted-foreground">“{query}”</span>
              ) : null}
            </button>
          </div>
        </div>
      ) : null}

      {creating ? (
        <CreateInline
          initialName={query}
          onCreated={(c) => {
            setCreating(false);
            pick(c);
          }}
          onCancel={() => setCreating(false)}
          error={createError}
          setError={setCreateError}
        />
      ) : null}
    </div>
  );
}

function CreateInline({
  initialName,
  onCreated,
  onCancel,
  error,
  setError,
}: {
  initialName: string;
  onCreated: (c: CompanyOption) => void;
  onCancel: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [websiteUrl, setWebsiteUrl] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("El nombre es obligatorio");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createCompanyAction({
        name: trimmed,
        websiteUrl: websiteUrl.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Re-fetch the just-created row so we have domain.
      const search = await searchCompaniesAction(trimmed, 1);
      const found = search.ok
        ? search.data.find((c) => c.id === res.data.companyId) ?? null
        : null;
      onCreated(
        found ?? {
          id: res.data.companyId,
          name: trimmed,
          domain: null,
          logo_url: null,
          status: "prospect",
        },
      );
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      className="absolute left-0 right-0 top-full z-30 mt-1 space-y-2 rounded-md border border-border bg-background p-3 shadow-dropdown"
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKey}
        placeholder="Nombre de la empresa *"
        autoFocus
      />
      <Input
        value={websiteUrl}
        onChange={(e) => setWebsiteUrl(e.target.value)}
        onKeyDown={onKey}
        placeholder="Página web de la empresa (opcional)"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? "Creando…" : "Crear"}
        </Button>
      </div>
    </div>
  );
}
