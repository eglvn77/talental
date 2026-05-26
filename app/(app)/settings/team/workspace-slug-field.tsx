"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  checkWorkspaceSlugAvailabilityAction,
  updateWorkspaceSlugAction,
} from "../actions";

type Status =
  | "idle"
  | "checking"
  | "ok"
  | "invalid_format"
  | "reserved"
  | "taken"
  | "in_history"
  | "error";

const STATUS_MSG: Record<Exclude<Status, "idle" | "checking" | "ok">, string> = {
  invalid_format:
    "Solo minúsculas, números y guiones. Entre 3 y 40 caracteres, sin guion al inicio/final.",
  reserved: "Ese slug está reservado, escoge otro.",
  taken: "Ese slug ya está tomado por otra agencia.",
  in_history:
    "Otra agencia usó ese slug hace menos de 30 días. Pruébalo después.",
  error: "No se pudo verificar la disponibilidad.",
};

/**
 * Workspace slug editor — the handle that lives in the careers URL
 * (`jobs.talental.mx/<slug>`). Behaves like a username picker:
 *
 *   - Debounced availability check while typing (250 ms).
 *   - Inline status (✓ disponible / mensaje contextual de error).
 *   - Submit only when status === 'ok' AND the value actually changed.
 *
 * On successful rename the DB trigger archives the old slug into
 * workspace_slug_history; the careers route 301s old links for 30
 * days. We surface that grace window in the confirmation toast so
 * the admin knows the rename isn't instantly destructive.
 */
export function WorkspaceSlugField({
  initialSlug,
}: {
  initialSlug: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialSlug);
  const [status, setStatus] = useState<Status>("idle");
  const [saving, setSaving] = useState(false);
  const initial = useRef(initialSlug);

  useEffect(() => {
    setValue(initialSlug);
    initial.current = initialSlug;
    setStatus("idle");
  }, [initialSlug]);

  // Debounced availability check. Skips the RPC when the value
  // matches what we started with (no point asking "is my own slug
  // available?").
  useEffect(() => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === initial.current) {
      setStatus("idle");
      return;
    }
    setStatus("checking");
    const handle = setTimeout(async () => {
      const res = await checkWorkspaceSlugAvailabilityAction({
        candidate: trimmed,
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus(res.status);
    }, 250);
    return () => clearTimeout(handle);
  }, [value]);

  const trimmed = value.trim().toLowerCase();
  const changed = trimmed && trimmed !== initial.current;
  const canSave = changed && status === "ok" && !saving;

  async function onSave() {
    setSaving(true);
    const res = await updateWorkspaceSlugAction({ slug: trimmed });
    setSaving(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar el slug", res.error);
      return;
    }
    toast.actionOk(
      "Slug actualizado",
      `Los links viejos redirigen al nuevo durante 30 días.`,
    );
    initial.current = trimmed;
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor="ws-slug" className="text-xs font-medium">
          Slug de la agencia
        </label>
        {status === "checking" ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <div className="flex max-w-md items-center gap-2">
        <div className="flex flex-1 items-center gap-0 rounded-md border border-border bg-bg-1 focus-within:ring-2 focus-within:ring-accent">
          <span className="select-none pl-2 pr-1 text-xs text-muted-foreground">
            app.talental.mx/careers/
          </span>
          <Input
            id="ws-slug"
            value={value}
            onChange={(e) =>
              setValue(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "")
                  .slice(0, 40),
              )
            }
            className="h-9 flex-1 border-0 bg-transparent px-1 font-mono text-xs focus-visible:ring-0"
            placeholder="mi-agencia"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={!canSave}
          className="shrink-0"
        >
          Guardar
        </Button>
      </div>
      {changed && status !== "idle" && status !== "checking" ? (
        <p
          className={
            "flex items-center gap-1 text-[11px] " +
            (status === "ok" ? "text-positive" : "text-danger")
          }
        >
          {status === "ok" ? (
            <>
              <Check className="h-3 w-3" />
              Disponible.
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3" />
              {STATUS_MSG[status as Exclude<Status, "idle" | "checking" | "ok">]}
            </>
          )}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Aparece en la URL pública de carreras. Cambiarlo redirige los
          links viejos durante 30 días.
        </p>
      )}
    </div>
  );
}
