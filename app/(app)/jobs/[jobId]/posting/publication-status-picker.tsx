"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { updateJobAction } from "../../../actions";

type PublicationStatus = "draft" | "listed" | "unlisted";

/**
 * Top-of-tab visibility control. The DB carries three states (draft /
 * listed / unlisted) but they decompose cleanly into two yes/no
 * questions, which is what the UI now asks:
 *
 *   1) "Publicar vacante"            → off = draft / on = at least unlisted
 *   2) "Mostrar en la página…"       → off = unlisted / on = listed
 *      (only meaningful when #1 is on)
 *
 * A single Select carried too much hidden mapping (listed vs unlisted
 * is a sub-decision of "is it published at all?"), and recruiters
 * landed on the wrong option more than they should have.
 *
 * Status='activa' is still required (set elsewhere via the header
 * pill); we surface a hint inline so the admin understands why a
 * "published + listed" vacante still doesn't appear publicly if it's
 * not also `activa`.
 *
 * Includes a "Copy link" affordance — the canonical URL is
 * `<current-origin>/careers/<workspace_slug>/<job_slug>`.
 */
export function PublicationStatusPicker({
  jobId,
  initial,
  workspaceSlug,
  jobSlug,
  jobIsActive,
}: {
  jobId: string;
  initial: PublicationStatus;
  workspaceSlug: string;
  jobSlug: string;
  /** Whether the job's internal `status` is `activa`. Drives the
   *  warning shown when the admin publishes but the job isn't
   *  activated yet. */
  jobIsActive: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<PublicationStatus>(initial);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Single mutation entry point. Computes the next status from the
  // two-toggle state, optimistic-updates, rolls back on failure.
  function setStatus(next: PublicationStatus) {
    if (next === value) return;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const res = await updateJobAction({
        jobId,
        publicationStatus: next,
      });
      if (!res.ok) {
        toast.actionFailed("No se pudo actualizar", res.error);
        setValue(prev);
        return;
      }
      router.refresh();
    });
  }

  const isPublished = value !== "draft";
  const isListed = value === "listed";

  function togglePublished(on: boolean) {
    // Turning publication off zeros the state to draft.
    // Turning it on defaults to "listed" because that's almost
    // always what the recruiter wants — `unlisted` is the rare
    // share-by-link-only case, opt-in via the sub-toggle.
    setStatus(on ? "listed" : "draft");
  }

  function toggleListed(on: boolean) {
    // Only meaningful when already published; guard so accidental
    // clicks on the disabled sub-toggle don't mutate state.
    if (!isPublished) return;
    setStatus(on ? "listed" : "unlisted");
  }

  // Same origin as the app — careers lives under `/careers/<wsSlug>/
  // <jobSlug>` so a single domain serves both surfaces.
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/careers/${workspaceSlug}/${jobSlug}`
      : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.actionFailed("No se pudo copiar el link");
    }
  }

  const showActiveWarning = isPublished && !jobIsActive;

  return (
    <div className="rounded-md border border-border bg-bg-1 p-4">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Visibilidad pública</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Quién puede ver esta vacante en el sitio público de carreras.
          </p>
        </div>

        {/* Primary toggle: publish or don't. */}
        <ToggleRow
          label="Publicar vacante"
          description={
            isPublished
              ? "Accesible mediante el link directo."
              : "Nadie puede acceder al link público — devuelve 404."
          }
          checked={isPublished}
          onChange={togglePublished}
          disabled={isPending}
          loading={isPending}
        />

        {/* Sub-toggle: show on the careers landing. Renders only
            when the parent is on so the relationship reads at a
            glance — no disabled-and-confusing leftover control. */}
        {isPublished ? (
          <div className="border-l-2 border-border pl-3">
            <ToggleRow
              label="Mostrar en la página de carreras"
              description={
                isListed
                  ? "Aparece en la lista pública del workspace."
                  : "Sólo accesible mediante el link directo — oculta de la lista."
              }
              checked={isListed}
              onChange={toggleListed}
              disabled={isPending}
            />
          </div>
        ) : null}
      </div>

      {showActiveWarning ? (
        <p className="mt-3 rounded-md border border-warning-soft bg-warning-soft/40 px-3 py-2 text-[11px] text-warning">
          La vacante todavía no está activa — cambia el estado a
          &ldquo;Activa&rdquo; en el header para que la publicación se
          haga efectiva.
        </p>
      ) : null}

      {isPublished ? (
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded border border-border bg-bg-2 px-2 py-1 font-mono text-[11px] text-foreground">
            {publicUrl || "Cargando…"}
          </code>
          <button
            type="button"
            onClick={copyLink}
            disabled={!publicUrl}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-1 px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50"
            title="Copiar link"
            aria-label="Copiar link"
          >
            {copied ? (
              <Check className="h-3 w-3 text-positive" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <a
            href={publicUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-1 px-2 py-1 text-xs text-foreground hover:bg-muted"
            title="Ver publicación"
          >
            <ExternalLink className="h-3 w-3" />
            Ver
          </a>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Toggle row with label + description on the left, switch on the
 * right. Mirrors the existing ToggleSwitch in posting-editor.tsx (h-5
 * w-9 track + h-4 w-4 thumb) — kept inline rather than promoted to a
 * shared primitive since this file is the only other caller for now.
 */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  loading,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {label}
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-accent" : "bg-bg-3",
        )}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}
