"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type CompanyStatus } from "@/lib/hiring";
import { useListNav } from "@/lib/use-list-nav";
import {
  createCompanyAction,
  searchCompaniesAction,
} from "../../actions";
import { useT } from "@/lib/i18n/client";

type CompanyOption = {
  id: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  status: CompanyStatus;
};

/**
 * Company picker. Renders like a regular select:
 *   - Closed: a button showing the selected company + a chevron.
 *   - Open: the chevron rotates, a search input opens above the
 *     options list, and the user can either pick a different company
 *     or create a new one.
 *
 * Outside-click closes the dropdown without changing the value, so
 * clicking the chevron + clicking away can never blank the selection
 * by accident — the value only changes when the user actively picks
 * a new option.
 */
export function CompanyCombobox({
  defaultCompany = null,
  onChange,
}: {
  defaultCompany?: CompanyOption | null;
  onChange?: (company: CompanyOption | null) => void;
} = {}) {
  const t = useT();
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Local DB search.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await searchCompaniesAction(query, 10);
        if (ctrl.signal.aborted) return;
        if (res.ok) setOptions(res.data);
      });
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        // Just close the dropdown. The selection stays as-is — the
        // user only changes the value by actively picking a new
        // option, never by clicking outside.
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Focus the search input when the dropdown opens — same UX as a
  // native <select> typeahead.
  useEffect(() => {
    if (open) {
      // Defer one frame so the input exists when we focus it.
      const timer = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  function pick(c: CompanyOption) {
    setSelected(c);
    setOpen(false);
    setQuery("");
    onChange?.(c);
  }

  // Keyboard navigation: ↑/↓ moves through `options`, Enter picks.
  const { highlight, setHighlight, onKeyDown: navKeys } = useListNav(
    options,
    pick,
  );

  return (
    // Cap the picker at a comfortable form-field width so it doesn't
    // stretch full-row in wider containers. The dropdown anchors to
    // this same box via absolute positioning.
    <div className="relative max-w-md" ref={wrapRef}>
      {/* The trigger button mimics a native select: full-width on
          mobile, capped on desktop via max-w on the parent <Field>.
          Closed: shows the selected company (or placeholder) +
          chevron. Open: still shows the selected name but the chevron
          rotates and the dropdown opens below. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-left text-sm transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {selected ? (
          <>
            <span className="flex-1 truncate">{selected.name}</span>
            {selected.domain ? (
              <span className="truncate text-xs text-muted-foreground">
                {selected.domain}
              </span>
            ) : null}
          </>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">
            {t("jobsList.selectCompany")}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <input type="hidden" name="company_id" value={selected?.id ?? ""} />

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
          <div className="border-b border-border p-2">
            <Input
              ref={searchInputRef}
              placeholder={t("jobsList.searchCompanyPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                  return;
                }
                navKeys(e);
              }}
              className="h-8"
            />
          </div>
          {/* onMouseLeave clears the highlight so it doesn't bleed
              when the pointer drops onto the "Crear nuevo cliente"
              row below — without it the last-hovered option stayed
              highlighted while the create button was being hovered. */}
          <div
            className="max-h-72 overflow-y-auto"
            onMouseLeave={() => setHighlight(-1)}
          >
            {options.length > 0 ? (
              options.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    i === highlight ? "bg-muted" : "hover:bg-muted",
                    selected?.id === c.id ? "font-medium" : "",
                  )}
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.domain ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {c.domain}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {query.trim().length < 2
                  ? t("jobsList.searchMinChars")
                  : t("jobsList.searchNoMatches")}
              </div>
            )}
          </div>

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
              {t("jobsList.createNewClient")}
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
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [websiteUrl, setWebsiteUrl] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("jobsList.companyNameRequired"));
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
        placeholder={t("jobsList.companyNamePlaceholder")}
        autoFocus
      />
      <Input
        value={websiteUrl}
        onChange={(e) => setWebsiteUrl(e.target.value)}
        onKeyDown={onKey}
        placeholder={t("jobsList.companyWebsitePlaceholder")}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isPending}
        >
          {t("jobsList.cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? t("jobsList.creatingShort") : t("jobsList.create")}
        </Button>
      </div>
    </div>
  );
}
