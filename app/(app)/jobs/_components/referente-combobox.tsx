"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Building2, Loader2, Plus, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  createContactAction,
  searchContactsAction,
} from "@/app/(app)/contacts/actions";
import {
  createCompanyAction,
  searchCompaniesAction,
} from "@/app/(app)/actions";

/**
 * Picker for the referente — "quien me presentó al cliente". Either
 * a contact (a person) OR a company can be the referrer, mutually
 * exclusive (enforced by the DB CHECK on hiring.jobs).
 *
 *   - Type → debounced search across BOTH hiring.contacts (full_name
 *     + email) AND hiring.companies (name + domain).
 *   - Each row in the dropdown is tagged with a UserRound or
 *     Building2 icon so the user can tell at a glance which kind
 *     they're picking.
 *   - Type a new name → the dropdown shows two affordances: "Crear
 *     como contacto" + "Crear como empresa". User picks the kind on
 *     creation.
 *
 * Emits `onChange` with a discriminated union — { kind: "contact" |
 * "company", id, label } — and writes the corresponding id into one
 * of two hidden inputs (lead_contact_id / lead_company_id) so the
 * wrapping <form>'s FormData round-trip stays the same as before.
 */

export type ReferenteValue =
  | { kind: "contact"; id: string; label: string }
  | { kind: "company"; id: string; label: string };

type Hit = {
  kind: "contact" | "company";
  id: string;
  label: string;
  /** Secondary text (email for contacts, domain for companies). */
  sub: string | null;
};

export function ReferenteCombobox({
  contactName,
  companyName,
  defaultValue = null,
  placeholder = "Buscar contacto o empresa…",
  onChange,
  disabled,
}: {
  /** Hidden input name for the contact id half. */
  contactName: string;
  /** Hidden input name for the company id half. */
  companyName: string;
  defaultValue?: ReferenteValue | null;
  placeholder?: string;
  onChange?: (v: ReferenteValue | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(defaultValue?.label ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState<ReferenteValue | null>(defaultValue);
  const [open, setOpen] = useState(false);
  const [creatingKind, setCreatingKind] = useState<
    null | "contact" | "company"
  >(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced search across both directories in parallel.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      startSearch(async () => {
        const [contactsRes, companiesRes] = await Promise.all([
          searchContactsAction(query, 6),
          searchCompaniesAction(query, 6),
        ]);
        if (ctrl.signal.aborted) return;
        const merged: Hit[] = [];
        if (contactsRes.ok) {
          for (const c of contactsRes.data) {
            merged.push({
              kind: "contact",
              id: c.id,
              label: c.full_name,
              sub: c.email,
            });
          }
        }
        if (companiesRes.ok) {
          for (const c of companiesRes.data) {
            merged.push({
              kind: "company",
              id: c.id,
              label: c.name,
              sub: c.domain,
            });
          }
        }
        // Order: exact-prefix matches first, then by label.
        const q = query.trim().toLowerCase();
        merged.sort((a, b) => {
          const aPrefix = a.label.toLowerCase().startsWith(q) ? 0 : 1;
          const bPrefix = b.label.toLowerCase().startsWith(q) ? 0 : 1;
          if (aPrefix !== bPrefix) return aPrefix - bPrefix;
          return a.label.localeCompare(b.label);
        });
        setHits(merged.slice(0, 10));
      });
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(v: ReferenteValue | null) {
    setSelected(v);
    setQuery(v?.label ?? "");
    setOpen(false);
    onChange?.(v);
  }

  const exactHit = hits.find(
    (h) => h.label.toLowerCase() === query.trim().toLowerCase(),
  );
  const canCreate = query.trim().length > 1 && !exactHit && !creatingKind;

  const handleCreate = useCallback(
    async (kind: "contact" | "company") => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setCreatingKind(kind);
      setCreateError(null);
      const res =
        kind === "contact"
          ? await createContactAction({ fullName: trimmed })
          : await createCompanyAction({ name: trimmed });
      setCreatingKind(null);
      if (!res.ok) {
        setCreateError(res.error);
        return;
      }
      const id =
        kind === "contact"
          ? (res.data as { contactId: string }).contactId
          : (res.data as { companyId: string }).companyId;
      pick({ kind, id, label: trimmed });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query],
  );

  return (
    <div ref={wrapRef} className="relative">
      <Input
        type="text"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          if (selected) {
            setSelected(null);
            onChange?.(null);
          }
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {/* One id is set, the other empty — the action's
          sanitizeFeeTerms enforces the mutual exclusion server-side
          too. */}
      <input
        type="hidden"
        name={contactName}
        value={selected?.kind === "contact" ? selected.id : ""}
      />
      <input
        type="hidden"
        name={companyName}
        value={selected?.kind === "company" ? selected.id : ""}
      />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-bg-1 py-1 shadow-dropdown">
          {isSearching && hits.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              Buscando…
            </div>
          ) : null}
          {hits.map((h) => (
            <button
              key={`${h.kind}:${h.id}`}
              type="button"
              onClick={() =>
                pick({ kind: h.kind, id: h.id, label: h.label })
              }
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-3"
            >
              {h.kind === "contact" ? (
                <UserRound className="h-3 w-3 shrink-0 text-fg-muted" />
              ) : (
                <Building2 className="h-3 w-3 shrink-0 text-fg-muted" />
              )}
              <span className="font-medium text-fg-1">{h.label}</span>
              {h.sub ? (
                <span className="ml-1 text-fg-muted">{h.sub}</span>
              ) : null}
            </button>
          ))}
          {canCreate ? (
            <div className="border-t border-border-soft">
              <button
                type="button"
                onClick={() => void handleCreate("contact")}
                disabled={creatingKind !== null}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-accent hover:bg-bg-3 disabled:opacity-60"
              >
                {creatingKind === "contact" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Crear &ldquo;{query.trim()}&rdquo;
                <span className="ml-1 text-fg-muted">como contacto</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCreate("company")}
                disabled={creatingKind !== null}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-accent hover:bg-bg-3 disabled:opacity-60"
              >
                {creatingKind === "company" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Crear &ldquo;{query.trim()}&rdquo;
                <span className="ml-1 text-fg-muted">como empresa</span>
              </button>
            </div>
          ) : null}
          {hits.length === 0 && !isSearching && !canCreate ? (
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
