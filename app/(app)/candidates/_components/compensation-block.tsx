"use client";

import { useState, useTransition } from "react";
import { DollarSign } from "lucide-react";
import { toast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { updateCandidateContactAction } from "@/app/(app)/_actions/candidate-profile";
import { useT } from "@/lib/i18n/client";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currencies";

type Patch = Parameters<typeof updateCandidateContactAction>[0]["patch"];

/**
 * Compensation editor (current + expected, amount + currency) for
 * the Detalles accordion. Split out of the old CandidateInspector —
 * contact fields moved to the ContactStrip at the top of the tab,
 * leaving only compensation here so nothing renders twice.
 * Autosaves on blur / currency change.
 */
export function CompensationBlock({
  candidateId,
  compCurrentAmount,
  compCurrentCurrency,
  compExpectedAmount,
  compExpectedCurrency,
}: {
  candidateId: string;
  compCurrentAmount: number | null;
  compCurrentCurrency: string | null;
  compExpectedAmount: number | null;
  compExpectedCurrency: string | null;
}) {
  const t = useT();
  const [, start] = useTransition();

  function persist(patch: Patch) {
    start(async () => {
      const res = await updateCandidateContactAction({ candidateId, patch });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <MoneyRow
        label={t("candidatesArea.compCurrentShort")}
        amount={compCurrentAmount}
        currency={compCurrentCurrency}
        onSave={(a, c) =>
          persist({ comp_current_amount: a, comp_current_currency: c })
        }
      />
      <MoneyRow
        label={t("candidatesArea.compExpectedShort")}
        amount={compExpectedAmount}
        currency={compExpectedCurrency}
        onSave={(a, c) =>
          persist({ comp_expected_amount: a, comp_expected_currency: c })
        }
      />
    </div>
  );
}

function MoneyRow({
  label,
  amount,
  currency,
  onSave,
}: {
  label: string;
  amount: number | null;
  currency: string | null;
  onSave: (amount: number | null, currency: string) => void;
}) {
  const [raw, setRaw] = useState(amount === null ? "" : String(amount));
  const [cur, setCur] = useState(currency || DEFAULT_CURRENCY);

  function commit(nextRaw: string, nextCur: string) {
    const parsed = nextRaw.trim() === "" ? null : Number(nextRaw);
    const cleaned = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    onSave(cleaned, nextCur);
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
        style={{ minWidth: 90 }}
      >
        <DollarSign className="h-3.5 w-3.5 text-muted-foreground/70" />
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={raw}
        placeholder="—"
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          const before = amount === null ? "" : String(amount);
          if (raw !== before) commit(raw, cur);
        }}
        className="h-8 w-full flex-1 rounded-md border border-border bg-background px-2 text-sm"
      />
      <Select
        value={cur}
        onChange={(v) => {
          setCur(v);
          commit(raw, v);
        }}
        options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
        className="w-[84px] shrink-0"
        searchable
      />
    </div>
  );
}
