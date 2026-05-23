"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import type { JobRow, ContactRow, CompanyRow } from "@/lib/hiring";
import { updateJobAction, type FeeTermsInput } from "@/app/(app)/actions";
import {
  FeeTermsBlock,
  type CompanyOption,
  type ContactOption,
  type FeeTermsValues,
} from "../../_components/fee-terms-block";

/**
 * Settings-page wrapper around <FeeTermsBlock>.
 *
 * Pulls the current commercial terms off the job row, hands them to
 * the block as defaults, and exposes a Save button at the bottom.
 * Settings-page edits are explicit (not autosaved) so a user can
 * tweak retainer % then change their mind without firing N writes.
 */
export function FeeTermsCard({
  job,
  contacts,
  companies,
}: {
  job: JobRow;
  contacts: ReadonlyArray<Pick<ContactRow, "id" | "full_name">>;
  companies: ReadonlyArray<Pick<CompanyRow, "id" | "name">>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const defaults: Partial<FeeTermsValues> = {
    feeModel: (job.fee_model as FeeTermsValues["feeModel"]) ?? null,
    billingFormat:
      (job.billing_format as FeeTermsValues["billingFormat"]) ?? null,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    salaryCurrency: job.salary_currency,
    salaryFrequency: job.salary_frequency,
    feeMonths: job.fee_months,
    feePct: job.fee_pct,
    retainerPct: job.retainer_pct,
    recruiterSplitPct: job.recruiter_split_pct,
    leadContactId: job.lead_contact_id,
    leadCompanyId: job.lead_company_id,
    leadSplitPct: job.lead_split_pct,
  };

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
    setSaved(false);
    startTransition(async () => {
      const res = await updateJobAction({
        jobId: job.id,
        salaryMin: num("salary_min"),
        salaryMax: num("salary_max"),
        salaryCurrency: str("salary_currency"),
        salaryFrequency: str("salary_frequency"),
        feeTerms,
      });
      if (!res.ok) {
        setError(res.error);
        toast.actionFailed("No se pudo guardar", res.error);
        return;
      }
      setSaved(true);
      toast.actionOk("Términos comerciales guardados");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FeeTermsBlock
        defaultValues={defaults}
        contacts={contactOptions}
        companies={companyOptions}
      />
      <div className="flex items-center justify-end gap-3">
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {saved && !error ? (
          <p className="text-xs text-fg-muted">Guardado</p>
        ) : null}
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending ? "Guardando…" : "Guardar términos"}
        </Button>
      </div>
    </form>
  );
}
