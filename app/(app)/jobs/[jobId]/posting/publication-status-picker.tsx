"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { updateJobAction } from "../../../actions";

type PublicationStatus = "draft" | "listed" | "unlisted";

/**
 * Top-of-tab control for who can see the public posting page.
 *
 *   Borrador        → publication_status='draft'    — never live
 *   Publicada       → publication_status='listed'   — landing + link
 *   No listada      → publication_status='unlisted' — link only
 *
 * Status='activa' is still required (set elsewhere via the header
 * pill); we surface a hint inline so the admin understands why a
 * "listed" vacante still doesn't appear publicly if it's not also
 * `activa`.
 *
 * Includes a "Copy link" affordance — the canonical URL is
 * `jobs.<NEXT_PUBLIC_CAREERS_DOMAIN>/<workspace_slug>/<job_slug>`.
 * Both slugs are stable: workspace.slug is UNIQUE and the signup
 * flow auto-disambiguates collisions; jobs.slug is generated on
 * INSERT and frozen by a Postgres trigger, so renaming the vacante
 * later doesn't break previously-shared links.
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
   *  warning shown when the admin picks a non-draft state but the
   *  job isn't activated yet. */
  jobIsActive: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<PublicationStatus>(initial);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function onChange(next: PublicationStatus) {
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
      toast.actionOk("Estado actualizado");
      router.refresh();
    });
  }

  // Public URL. The domain is wired through NEXT_PUBLIC_CAREERS_DOMAIN
  // so dev / preview / production each carry their own host. Falls
  // back to the current location's host when the env isn't set —
  // useful for branch previews.
  const publicUrl =
    typeof window !== "undefined"
      ? (() => {
          const host =
            process.env.NEXT_PUBLIC_CAREERS_DOMAIN ||
            `jobs.${window.location.host.replace(/^jobs\./, "")}`;
          return `https://${host}/${workspaceSlug}/${jobSlug}`;
        })()
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

  const showActiveWarning = value !== "draft" && !jobIsActive;

  return (
    <div className="rounded-md border border-border bg-bg-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Visibilidad pública</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Quién puede ver esta vacante en el sitio público de carreras.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={value}
            onChange={(v) => onChange(v as PublicationStatus)}
            disabled={isPending}
            className="w-44"
            options={[
              { value: "draft", label: "Borrador" },
              { value: "listed", label: "Publicada" },
              { value: "unlisted", label: "No listada" },
            ]}
          />
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        {value === "draft"
          ? "No se puede acceder a la vacante desde el público — el link público devuelve 404."
          : value === "listed"
            ? "Aparece en la página de carreras del workspace y se puede compartir con su link directo."
            : "Solo accesible mediante el link directo — no se muestra en la lista pública."}
      </p>

      {showActiveWarning ? (
        <p className="mt-2 rounded-md border border-warning-soft bg-warning-soft/40 px-3 py-2 text-[11px] text-warning">
          La vacante todavía no está activa — cambia el estado a
          &ldquo;Activa&rdquo; en el header para que la publicación se
          haga efectiva.
        </p>
      ) : null}

      {value !== "draft" ? (
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
