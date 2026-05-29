"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Merge, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  mergeCandidatesAction,
  type DuplicateCandidate,
  type DuplicateGroup,
  type MergeFields,
} from "../../_actions/candidate-merge";

/** Pickable fields, in display order. Keys match MergeFields / the RPC. */
const FIELDS: Array<{ key: keyof MergeFields; label: string; long?: boolean }> = [
  { key: "full_name", label: "Nombre" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Teléfono" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "headline", label: "Headline" },
  { key: "current_company_name", label: "Empresa actual" },
  { key: "current_position", label: "Puesto actual" },
  { key: "location", label: "Ubicación" },
  { key: "resume_url", label: "CV" },
  { key: "profile_picture_url", label: "Foto" },
  { key: "summary", label: "Resumen", long: true },
];

export function DuplicatesReview({ groups }: { groups: DuplicateGroup[] }) {
  const [active, setActive] = useState<{
    a: DuplicateCandidate;
    b: DuplicateCandidate;
  } | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {groups.length} grupo{groups.length === 1 ? "" : "s"} con nombre
        repetido.
      </p>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li
            key={g.matchKey}
            className="rounded-md border border-border bg-background p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                {g.candidates[0]?.full_name ?? g.matchKey}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    g.matchType === "name"
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-100 text-amber-800",
                  )}
                  title={
                    g.matchType === "name"
                      ? "Mismo nombre"
                      : "Mismo perfil de LinkedIn — señal fuerte"
                  }
                >
                  {g.matchType === "name" ? "Mismo nombre" : "Mismo LinkedIn"}
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {g.candidates.length} registros
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.candidates.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {c.email ?? "sin email"} · {c.application_count} vac.
                </span>
              ))}
            </div>
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() =>
                  setActive({ a: g.candidates[0], b: g.candidates[1] })
                }
              >
                <Merge className="h-3.5 w-3.5" />
                Revisar y fusionar
                {g.candidates.length > 2 ? " (primeros 2)" : ""}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {active ? (
        <MergeDialog
          a={active.a}
          b={active.b}
          onClose={() => setActive(null)}
        />
      ) : null}
    </div>
  );
}

function val(c: DuplicateCandidate, key: keyof MergeFields): string {
  const v = c[key as keyof DuplicateCandidate];
  return typeof v === "string" ? v : "";
}

function MergeDialog({
  a,
  b,
  onClose,
}: {
  a: DuplicateCandidate;
  b: DuplicateCandidate;
  onClose: () => void;
}) {
  const router = useRouter();
  const [survivor, setSurvivor] = useState<"a" | "b">("a");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Per-field side selection. Default: prefer a non-empty value;
  // when both differ, favor the survivor's side.
  const [picks, setPicks] = useState<Record<string, "a" | "b">>(() => {
    const init: Record<string, "a" | "b"> = {};
    for (const f of FIELDS) {
      const av = val(a, f.key);
      const bv = val(b, f.key);
      if (av && !bv) init[f.key] = "a";
      else if (!av && bv) init[f.key] = "b";
      else init[f.key] = "a"; // both empty or both set → default A
    }
    return init;
  });

  const primary = survivor === "a" ? a : b;
  const secondary = survivor === "a" ? b : a;

  const resolvedFields = useMemo<MergeFields>(() => {
    const out: Record<string, string | null> = {};
    for (const f of FIELDS) {
      const side = picks[f.key];
      const chosen = side === "a" ? val(a, f.key) : val(b, f.key);
      out[f.key] = chosen || null;
    }
    return out as MergeFields;
  }, [picks, a, b]);

  async function doMerge() {
    setSubmitting(true);
    const res = await mergeCandidatesAction({
      primaryId: primary.id,
      secondaryId: secondary.id,
      fields: resolvedFields,
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo fusionar", res.error);
      return;
    }
    toast.actionOk("Candidatos fusionados");
    onClose();
    router.refresh();
  }

  return (
    <Dialog.Root open onOpenChange={(o) => (!o ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background shadow-xl">
          <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold">
                Fusionar candidatos
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                Elige qué registro sobrevive y qué dato conservar de cada
                uno. Aplicaciones, experiencia, notas y etiquetas de ambos
                se combinan.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Cerrar"
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Survivor selector */}
          <div className="grid grid-cols-[140px_1fr_1fr] items-center gap-2 border-b border-border bg-muted/30 px-5 py-2 text-xs">
            <span className="font-medium text-muted-foreground">
              ¿Cuál sobrevive?
            </span>
            {(["a", "b"] as const).map((side) => {
              const c = side === "a" ? a : b;
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => setSurvivor(side)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-left transition-colors",
                    survivor === side
                      ? "border-accent bg-accent/10 font-medium"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {c.full_name}
                  <span className="block text-[10px] text-muted-foreground">
                    {c.application_count} vacante
                    {c.application_count === 1 ? "" : "s"} ·{" "}
                    {c.enrichment_status ?? "sin enriquecer"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Field-by-field picker */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <div className="space-y-2">
              {FIELDS.map((f) => {
                const av = val(a, f.key);
                const bv = val(b, f.key);
                if (!av && !bv) return null; // nothing to choose
                const same = av === bv;
                return (
                  <div
                    key={f.key}
                    className="grid grid-cols-[140px_1fr_1fr] items-stretch gap-2"
                  >
                    <span className="pt-1.5 text-xs font-medium text-muted-foreground">
                      {f.label}
                    </span>
                    {(["a", "b"] as const).map((side) => {
                      const value = side === "a" ? av : bv;
                      const selected = picks[f.key] === side;
                      return (
                        <button
                          key={side}
                          type="button"
                          disabled={same}
                          onClick={() =>
                            setPicks((p) => ({ ...p, [f.key]: side }))
                          }
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                            f.long ? "whitespace-pre-wrap" : "truncate",
                            same
                              ? "cursor-default border-border/60 text-muted-foreground"
                              : selected
                                ? "border-accent bg-accent/10"
                                : "border-border hover:bg-muted",
                          )}
                          title={value || "—"}
                        >
                          {value || (
                            <span className="italic text-muted-foreground/60">
                              vacío
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            <span className="text-[11px] text-muted-foreground">
              Se eliminará <span className="font-medium">{secondary.full_name}</span>{" "}
              y su contenido pasará a {primary.full_name}.
            </span>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <Button type="button" size="sm" variant="outline">
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                onClick={() => setConfirmOpen(true)}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Merge className="h-3.5 w-3.5" />
                )}
                Fusionar
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar fusión"
        description={`Esta acción no se puede deshacer. Se eliminará "${secondary.full_name}" y se combinará en "${primary.full_name}".`}
        confirmLabel="Fusionar"
        destructive
        requireConfirmationText={primary.full_name}
        onConfirm={doMerge}
      />
    </Dialog.Root>
  );
}
