"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Building2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type CompanyStatus } from "@/lib/hiring";
import {
  createCompanyAction,
  searchCompaniesAction,
} from "../actions";

type CompanyOption = {
  id: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  status: CompanyStatus;
};

type WebSuggestion = {
  name: string;
  domain: string;
  logo: string;
};

export function CompanyCombobox() {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [webSuggestions, setWebSuggestions] = useState<WebSuggestion[]>([]);
  const [selected, setSelected] = useState<CompanyOption | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
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

  // Clearbit autocomplete (free, no auth, returns name+domain+logo).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setWebSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(
        `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`,
        { signal: ctrl.signal },
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((data: WebSuggestion[]) => {
          if (ctrl.signal.aborted) return;
          setWebSuggestions(Array.isArray(data) ? data.slice(0, 5) : []);
        })
        .catch(() => {
          /* network/abort errors fine */
        });
    }, 220);
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
  }

  function importFromWeb(s: WebSuggestion) {
    if (importing) return;
    setImporting(true);
    setCreateError(null);
    startTransition(async () => {
      const res = await createCompanyAction({
        name: s.name,
        websiteUrl: `https://${s.domain}`,
      });
      if (!res.ok) {
        setCreateError(res.error);
        setImporting(false);
        return;
      }
      // Hydrate the option for display.
      pick({
        id: res.data.companyId,
        name: s.name,
        domain: s.domain,
        logo_url: s.logo,
        status: "prospect",
      });
      setImporting(false);
    });
  }

  // Hide web suggestions whose domain we already have locally.
  const localDomains = new Set(
    options.map((o) => o.domain).filter(Boolean) as string[],
  );
  const filteredWeb = webSuggestions.filter(
    (w) => !localDomains.has(w.domain),
  );

  function clearSelection() {
    setSelected(null);
    setOpen(true);
  }

  return (
    <div className="relative" ref={wrapRef}>
      {selected ? (
        <button
          type="button"
          onClick={clearSelection}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
        >
          {selected.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.logo_url}
              alt=""
              className="h-5 w-5 rounded border border-border bg-white object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground" />
          )}
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
        />
      )}

      <input type="hidden" name="company_id" value={selected?.id ?? ""} />

      {open && !selected ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
          {options.length > 0 ? (
            <>
              <div className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Tus empresas
              </div>
              {options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logo_url}
                      alt=""
                      className="h-5 w-5 rounded border border-border bg-white object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.domain ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {c.domain}
                    </span>
                  ) : null}
                </button>
              ))}
            </>
          ) : null}

          {filteredWeb.length > 0 ? (
            <>
              <div
                className={
                  options.length > 0 ? "border-t border-border" : undefined
                }
              >
                <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  De internet
                </div>
              </div>
              {filteredWeb.map((s) => (
                <button
                  key={s.domain}
                  type="button"
                  disabled={importing}
                  onClick={() => importFromWeb(s)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.logo}
                    alt=""
                    className="h-5 w-5 rounded border border-border bg-white object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {s.domain}
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {options.length === 0 && filteredWeb.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {query.trim().length < 2
                ? "Escribe al menos 2 caracteres para buscar."
                : "Sin coincidencias."}
            </div>
          ) : null}

          {createError ? (
            <p className="border-t border-border px-3 py-1.5 text-xs text-red-600">
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
              Crear manualmente
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
      // Re-fetch the just-created row so we have logo_url/domain.
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

  // Enter on either input triggers submit; Esc cancels. Inputs can't be inside
  // a nested <form> (the parent is the role-create form), so handle keys
  // manually.
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
      className="absolute left-0 right-0 top-full z-30 mt-1 space-y-2 rounded-md border border-border bg-background p-3 shadow-lg"
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
        placeholder="canva.com o https://canva.com — protocolo opcional"
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
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
