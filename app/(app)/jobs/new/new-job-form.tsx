"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFormDraft } from "@/lib/form-draft";
import { createJobAction, type FeeTermsInput } from "../../actions";
import { CompanyCombobox } from "./company-combobox";
import {
  FeeTermsBlock,
  type FeeTermsValues,
} from "../_components/fee-terms-block";

/**
 * Open-vacante flow.
 *
 * Captures the minimum (title + client) plus the commercial terms
 * the recruiter knows at opening: fee model, billing format, salary
 * range, fee in months or %, retainer policy, sourcer/recruiter
 * commission, and any lead-referral commission. Defaults are
 * pre-filled (retained, factura, 1.8 m / 15%, 30% anticipo, 25%
 * sourcer) so the user can hit "Crear vacante" immediately.
 *
 * The whole form autosaves to localStorage on every change. Closing
 * the tab and coming back lands the user on their in-flight draft;
 * the "Borrador restaurado" banner offers a one-click reset. The
 * draft is cleared on successful create.
 *
 * The vacante still nace en Borrador (status) — JD, requisitos,
 * sourcing questions, etc. land via Kickoff after opening.
 */

const DRAFT_KEY = "tlt_draft.jobs.new";

type DraftShape = {
  title: string;
  companyId: string;
  companyDisplay: string | null;
  // FeeTermsBlock values mirrored here so we can rehydrate them.
  fee: Partial<FeeTermsValues>;
};

const INITIAL_DRAFT: DraftShape = {
  title: "",
  companyId: "",
  companyDisplay: null,
  fee: {},
};

export function NewJobForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft, draftMeta] = useFormDraft<DraftShape>(
    DRAFT_KEY,
    INITIAL_DRAFT,
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const companyId = String(fd.get("company_id") ?? "").trim();
    if (!companyId) {
      setError("Elige una empresa.");
      return;
    }

    const num = (k: string): number | null => {
      const v = fd.get(k);
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const str = (k: string): string | null => {
      const v = fd.get(k);
      return v == null ? null : String(v).trim() || null;
    };

    const feeTerms: FeeTermsInput = {
      feeModel: str("fee_model") as FeeTermsInput["feeModel"],
      billingFormat: str("billing_format") as FeeTermsInput["billingFormat"],
      feeMonths: num("fee_months"),
      feePct: num("fee_pct"),
      retainerPct: num("retainer_pct"),
      recruiterSplitPct: num("recruiter_split_pct"),
      sourcerContactId: str("sourcer_contact_id"),
      leadContactId: str("lead_contact_id"),
      leadCompanyId: str("lead_company_id"),
      leadSplitPct: num("lead_split_pct"),
    };

    setError(null);
    startTransition(async () => {
      const res = await createJobAction({
        companyId,
        title: String(fd.get("title") ?? ""),
        salaryMin: num("salary_min") ?? undefined,
        salaryMax: num("salary_max") ?? undefined,
        salaryCurrency: str("salary_currency"),
        salaryFrequency: str("salary_frequency"),
        feeTerms,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      draftMeta.clear();
      toast.actionOk("Vacante creada en Borrador");
      router.push(`/jobs/${res.data.jobId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {draftMeta.hadDraft ? (
        <div className="flex items-center justify-between rounded-md border border-border-soft bg-bg-3 px-3 py-2 text-xs text-fg-2">
          <span>
            Borrador restaurado{" "}
            <span className="text-fg-muted">
              · cierre la pestaña y todo lo que escribas aquí queda
              guardado automáticamente.
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              draftMeta.clear();
              setDraft(INITIAL_DRAFT);
              // Force a reload so all controlled inputs reset to
              // their fresh defaults. Simpler than threading reset
              // signals through every child.
              router.refresh();
            }}
            className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg-1"
          >
            <RotateCcw className="h-3 w-3" />
            Empezar de cero
          </button>
        </div>
      ) : null}

      <Field label="Título de la vacante" required>
        <Input
          name="title"
          required
          autoFocus
          placeholder="Ej: Senior Product Designer"
          defaultValue={draft.title}
          onChange={(e) =>
            setDraft((p) => ({ ...p, title: e.target.value }))
          }
        />
      </Field>

      <Field label="Empresa" required>
        <CompanyCombobox
          defaultCompany={
            draft.companyId
              ? {
                  id: draft.companyId,
                  name: draft.companyDisplay ?? "",
                  domain: null,
                  logo_url: null,
                  status: "client",
                }
              : null
          }
          onChange={(c) =>
            setDraft((p) => ({
              ...p,
              companyId: c?.id ?? "",
              companyDisplay: c?.name ?? null,
            }))
          }
        />
      </Field>

      <FeeTermsBlock
        defaultValues={draft.fee}
        onChange={(v) => setDraft((p) => ({ ...p, fee: v }))}
      />

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="text-xs text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="rounded-md border border-border-soft bg-bg-3 px-3 py-2.5 text-xs text-fg-muted">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-fg-1">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          La vacante se crea en Borrador
        </div>
        Tipo de rol, JD, requisitos y sourcing se completan con{" "}
        <strong>Kickoff</strong> o en <strong>Ajustes</strong> después
        de abrirla.
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
      <span className="text-xs font-medium text-fg-2">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
