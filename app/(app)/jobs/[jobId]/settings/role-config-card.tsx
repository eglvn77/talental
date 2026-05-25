"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { updateJobAction } from "@/app/(app)/actions";

type RoleType = "full_headhunting" | "hybrid_ai_hunting" | "inbound_ai_driven";

/**
 * "Configuración del rol" — the two column-backed knobs that the AI
 * flow needs every time it runs: the engagement model (Tipo de rol)
 * and the optional assessment link. Everything else that lived here
 * before (JD language, anuncio flags, emojis, etc.) moved to custom
 * fields so each workspace can extend / customise / hide them as
 * they grow.
 */
export function RoleConfigCard({
  jobId,
  initial,
}: {
  jobId: string;
  initial: {
    roleType: RoleType | null;
    assessmentLink: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [roleType, setRoleType] = useState<RoleType | null>(initial.roleType);
  const [assessmentLink, setAssessmentLink] = useState(
    initial.assessmentLink ?? "",
  );

  function onSave() {
    startTransition(async () => {
      const res = await updateJobAction({
        jobId,
        roleConfig: {
          roleType,
          assessmentLink: assessmentLink || null,
        },
      });
      if (!res.ok) {
        toast.actionFailed("No se pudo guardar", res.error);
        return;
      }
      toast.actionOk("Configuración guardada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Field label="Tipo de rol" required>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["full_headhunting", "Full Headhunting"],
              ["hybrid_ai_hunting", "Hybrid AI + Hunting"],
              ["inbound_ai_driven", "Inbound AI Driven"],
            ] as Array<[RoleType, string]>
          ).map(([v, label]) => (
            <Pill
              key={v}
              checked={roleType === v}
              onClick={() => setRoleType(v)}
              disabled={pending}
              label={label}
            />
          ))}
        </div>
      </Field>

      <Field label="Link del Assessment (opcional)">
        <Input
          type="url"
          value={assessmentLink}
          onChange={(e) => setAssessmentLink(e.target.value)}
          disabled={pending}
          placeholder="https://… (Typeform, Notion, Google Form, etc.)"
        />
      </Field>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={pending} className="gap-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
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
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Pill({
  checked,
  onClick,
  label,
  disabled,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        checked
          ? "rounded-full bg-accent px-3 py-1 text-xs font-medium text-fg-on-accent"
          : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
      }
    >
      {label}
    </button>
  );
}
