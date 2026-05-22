"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createJobAction } from "../../actions";
import { CompanyCombobox } from "./company-combobox";

/**
 * Minimal create flow: title + client + role_type. New vacantes nacen
 * en status "Borrador" (Draft). Ubicación, salario, descripción y demás
 * se llenan después — typically vía Kickoff (auto-popula desde el intake)
 * o manualmente en /jobs/[id]/settings.
 */
export function NewJobForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const companyId = String(fd.get("company_id") ?? "").trim();
    if (!companyId) {
      setError("Elige un cliente.");
      return;
    }

    const roleType = String(fd.get("role_type") ?? "").trim();
    if (!roleType) {
      setError("Elige el tipo de rol.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await createJobAction({
        companyId,
        title: String(fd.get("title") ?? ""),
        roleType,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Vacante creada en Borrador");
      router.push(`/jobs/${res.data.jobId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Título de la vacante" required>
        <Input
          name="title"
          required
          autoFocus
          placeholder="Ej: Senior Product Designer"
        />
      </Field>

      <Field label="Cliente" required>
        <CompanyCombobox />
      </Field>

      <Field label="Tipo de rol" required>
        <select
          name="role_type"
          required
          defaultValue=""
          className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Elige el tipo
          </option>
          <option value="full_headhunting">Full Headhunting</option>
          <option value="hybrid_ai_hunting">Hybrid AI + Hunting</option>
          <option value="inbound_ai_driven">Inbound AI Driven</option>
        </select>
      </Field>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="rounded-md border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-brand" />
          La vacante se crea en Borrador
        </div>
        Después corres <strong>Kickoff</strong> con la transcripción del intake
        para autocompletar JD, requirements, sourcing, outreach y checklist.
        Ubicación, salario y demás los puedes capturar en{" "}
        <strong>Ajustes</strong> cuando quieras.
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending ? "Creando vacante…" : "Crear vacante"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
