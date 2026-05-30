"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { updateJobAction } from "@/app/(app)/actions";

/**
 * "Configuración del rol" — the optional assessment link the AI flow
 * uses. The role type used to live here too, but the role is now
 * decided by the kickoff prompt the recruiter picks, so it's gone.
 */
export function RoleConfigCard({
  jobId,
  initial,
}: {
  jobId: string;
  initial: {
    assessmentLink: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [assessmentLink, setAssessmentLink] = useState(
    initial.assessmentLink ?? "",
  );

  function onSave() {
    startTransition(async () => {
      const res = await updateJobAction({
        jobId,
        roleConfig: {
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

