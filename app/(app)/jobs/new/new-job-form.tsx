"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ContactRow, CompanyRow } from "@/lib/hiring";
import { createJobAction, type FeeTermsInput } from "../../actions";
import { CompanyCombobox } from "./company-combobox";
import {
  FeeTermsBlock,
  type ContactOption,
  type CompanyOption,
} from "../_components/fee-terms-block";

/**
 * Open-vacante flow.
 *
 * Captures the minimum (title + client) plus the commercial terms
 * the recruiter knows at opening: fee model, billing format, salary
 * range, fee in months or %, retainer policy, and any lead-referral
 * commission. The FeeTermsBlock ships with sensible defaults
 * (retained, factura, 1.8 meses / 15%, 30% anticipo, 25% recruiter)
 * so a user can hit "Crear vacante" immediately and only tweak what
 * differs from standard.
 *
 * The vacante still nace en Borrador — JD, requisitos, sourcing
 * questions, etc. land via Kickoff after opening.
 */
export function NewJobForm({
  contacts,
  companies,
}: {
  contacts: ReadonlyArray<Pick<ContactRow, "id" | "full_name">>;
  companies: ReadonlyArray<Pick<CompanyRow, "id" | "name">>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const contactOptions: ContactOption[] = contacts.map((c) => ({
    id: c.id,
    full_name: c.full_name,
  }));
  const companyOptions: CompanyOption[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
  }));

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
      toast.actionOk("Vacante creada en Borrador");
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

      <Field label="Empresa" required>
        <CompanyCombobox />
      </Field>

      <FeeTermsBlock contacts={contactOptions} companies={companyOptions} />

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
