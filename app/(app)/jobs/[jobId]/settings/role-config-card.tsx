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
 * "Configuración del rol" — used to live inside the Kickoff /
 * Calibrar dialog under "SETUP". Promoted to its own Ajustes card
 * so it gets configured once per vacante, and the AI flow reads
 * the values from the row instead of asking again every run.
 *
 * Admin-only by tab gating (the parent /settings page redirects
 * non-admins out of admin-only routes; `updateJobAction` itself
 * also enforces `requireAdmin()`).
 *
 * The form is fully controlled and autosaves nothing — each click
 * on Guardar persists the current state. Keeps the change surface
 * predictable.
 */
export function RoleConfigCard({
  jobId,
  initial,
}: {
  jobId: string;
  initial: {
    roleType: RoleType | null;
    jdLanguage: "es" | "en";
    outreachLanguage: "es" | "en";
    aiProcessLanguage: "es" | "en" | null;
    includeSalaryInPost: boolean;
    includeCompanyInPost: boolean;
    useEmojisInJd: boolean;
    createAssessment: boolean;
    assessmentLink: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [roleType, setRoleType] = useState<RoleType | null>(initial.roleType);
  const [jdLang, setJdLang] = useState<"es" | "en">(initial.jdLanguage);
  const [outreachLang, setOutreachLang] = useState<"es" | "en">(
    initial.outreachLanguage,
  );
  const [aiLang, setAiLang] = useState<"es" | "en">(
    initial.aiProcessLanguage ?? "es",
  );
  const [includeSalary, setIncludeSalary] = useState(initial.includeSalaryInPost);
  const [includeCompany, setIncludeCompany] = useState(
    initial.includeCompanyInPost,
  );
  const [useEmojis, setUseEmojis] = useState(initial.useEmojisInJd);
  const [createAssessment, setCreateAssessment] = useState(
    initial.createAssessment,
  );
  const [assessmentLink, setAssessmentLink] = useState(
    initial.assessmentLink ?? "",
  );

  const isAiRole =
    roleType === "hybrid_ai_hunting" || roleType === "inbound_ai_driven";

  function onSave() {
    startTransition(async () => {
      const res = await updateJobAction({
        jobId,
        roleConfig: {
          roleType,
          jdLanguage: jdLang,
          outreachLanguage: outreachLang,
          // Only persist `ai_process_language` for AI roles; the
          // column nulls out otherwise.
          aiProcessLanguage: isAiRole ? aiLang : null,
          includeSalaryInPost: includeSalary,
          includeCompanyInPost: includeCompany,
          useEmojisInJd: useEmojis,
          createAssessment,
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Idioma del JD">
          <Toggle
            value={jdLang}
            onChange={(v) => setJdLang(v as "es" | "en")}
            options={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
            disabled={pending}
          />
        </Field>
        <Field label="Idioma del Outreach + LinkedIn">
          <Toggle
            value={outreachLang}
            onChange={(v) => setOutreachLang(v as "es" | "en")}
            options={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
            disabled={pending}
          />
        </Field>
      </div>

      {isAiRole ? (
        <Field label="Idioma del AI process">
          <Toggle
            value={aiLang}
            onChange={(v) => setAiLang(v as "es" | "en")}
            options={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
            disabled={pending}
          />
        </Field>
      ) : null}

      <Field label="Mostrar en el anuncio de empleo">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Checkbox
            checked={includeSalary}
            onChange={setIncludeSalary}
            label="Salario"
            disabled={pending}
          />
          <Checkbox
            checked={includeCompany}
            onChange={setIncludeCompany}
            label="Nombre de la empresa"
            disabled={pending}
          />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Incluir emojis en JD">
          <Toggle
            value={useEmojis ? "yes" : "no"}
            onChange={(v) => setUseEmojis(v === "yes")}
            options={[
              { value: "yes", label: "Sí" },
              { value: "no", label: "No" },
            ]}
            disabled={pending}
          />
        </Field>
        <Field label="Crear Assessment con AI">
          <Toggle
            value={createAssessment ? "yes" : "no"}
            onChange={(v) => setCreateAssessment(v === "yes")}
            options={[
              { value: "yes", label: "Sí" },
              { value: "no", label: "No" },
            ]}
            disabled={pending}
          />
        </Field>
      </div>

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

function Toggle({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={
            value === o.value
              ? "bg-foreground px-3 py-1 text-xs text-background"
              : "bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 cursor-pointer rounded border-border accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}
