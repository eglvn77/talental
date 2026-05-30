"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import { updateJobAction } from "../../../actions";

export type ContactOption = {
  id: string;
  full_name: string | null;
  title: string | null;
  company_name: string | null;
};

/**
 * Multi-select picker for `jobs.contact_ids`. Lists the workspace's
 * contacts (people, not candidates) so the recruiter can tag the
 * hiring manager, sourcing partner, referente, etc. that sit on the
 * client side of this vacante.
 *
 * UX:
 *   - Closed: a button that mirrors a native select — shows the count
 *     of selected contacts (or "Selecciona contactos" placeholder) +
 *     a chevron. Each selected contact renders as a removable chip
 *     above the trigger so the admin sees the current set at a glance.
 *   - Open: a search input + filtered list. Clicking an option toggles
 *     it on/off without closing the dropdown — multi-select is
 *     meant for picking a few people in one session.
 *   - Outside click closes the dropdown but never mutates the
 *     selection (same guardrail as the company combobox).
 *
 * Autosaves the full uuid array on every toggle via updateJobAction.
 */
export function ContactsPicker({
  jobId,
  initialIds,
  contacts,
}: {
  jobId: string;
  initialIds: string[];
  contacts: ContactOption[];
}) {
  const t = useT();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedIds(initialIds);
  }, [initialIds]);

  // Outside-click closes the dropdown without changing the value.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const selectedSet = new Set(selectedIds);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const filtered = contacts.filter((c) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      (c.full_name ?? "").toLowerCase().includes(q) ||
      (c.title ?? "").toLowerCase().includes(q) ||
      (c.company_name ?? "").toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    const next = selectedSet.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    startTransition(async () => {
      const res = await updateJobAction({ jobId, contactIds: next });
      if (!res.ok) {
        toast.actionFailed(t("jobSubtabs.contactsSaveFailed"), res.error);
        setSelectedIds(selectedIds);
        return;
      }
      router.refresh();
    });
  }

  function removeChip(id: string) {
    toggle(id);
  }

  return (
    <div className="space-y-2" ref={wrapRef}>
      {/* Selected chips above the trigger so the current set reads at
          a glance. Chips are removable; the dropdown is the way to
          add. */}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const c = byId.get(id);
            const label =
              c?.full_name ||
              c?.title ||
              t("jobSubtabs.unknownContact");
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent"
              >
                {label}
                <button
                  type="button"
                  onClick={() => removeChip(id)}
                  disabled={pending}
                  aria-label={t("jobSubtabs.removeContact", { label })}
                  className="rounded-full p-0.5 hover:bg-accent/20 disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-background px-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "flex-1 truncate",
              selectedIds.length === 0 && "text-muted-foreground",
            )}
          >
            {selectedIds.length === 0
              ? t("jobSubtabs.selectContacts")
              : selectedIds.length === 1
                ? t("jobSubtabs.contactsSelected_one", {
                    count: selectedIds.length,
                  })
                : t("jobSubtabs.contactsSelected_other", {
                    count: selectedIds.length,
                  })}
          </span>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-w-md overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
            <div className="border-b border-border p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
                placeholder={t("jobSubtabs.contactsSearchPlaceholder")}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {contacts.length === 0
                    ? t("jobSubtabs.noContactsYet")
                    : t("jobSubtabs.noMatches")}
                </div>
              ) : (
                filtered.map((c) => {
                  const active = selectedSet.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                        active && "bg-muted/60",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        readOnly
                        className="mt-1 h-3.5 w-3.5 pointer-events-none"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {c.full_name ?? t("jobSubtabs.noName")}
                        </span>
                        {c.title || c.company_name ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {[c.title, c.company_name]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
