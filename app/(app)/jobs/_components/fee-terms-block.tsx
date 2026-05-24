"use client";

import { useEffect, useMemo, useState } from "react";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currencies";
import type { BillingFormat, FeeModel } from "@/lib/hiring";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/eyebrow";
import { NumberInputWithCommas } from "../new/number-input";

/**
 * Commercial terms block for a job. Replaces the external Sheets
 * tracker — captures fee model, billing format, salary range,
 * fee in months or %, retainer policy, recruiter split, and lead
 * referral payout in one place.
 *
 * The block is self-contained:
 *  - All inputs have named `<input>`s so the wrapping `<form>` picks
 *    them up via FormData on submit.
 *  - Bidirectional sync between fee_months and fee_pct is a pure
 *    ratio (1 month ≡ 100/12 % of annual). Either input drives the
 *    other; both are stored so the form rehydrates without drift.
 *  - Live display of midpoint, total fee $, retainer $, and remaining
 *    placement $. All derived from the inputs — never stored.
 *  - When `feeModel = retained` the retainer % + retainer total
 *    appear. When `contingent` they're hidden (and any value sent
 *    is ignored server-side because the action only persists when
 *    the model allows it).
 *  - Lead recipient: contact OR company picker, mutually exclusive.
 *    DB CHECK constraint enforces the rule too.
 */

export type FeeTermsValues = {
  feeModel: FeeModel | null;
  billingFormat: BillingFormat | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryFrequency: string | null;
  feeMonths: number | null;
  feePct: number | null;
  retainerPct: number | null;
  recruiterSplitPct: number | null;
  recruiterTeamMemberId: string | null;
  leadContactId: string | null;
  leadCompanyId: string | null;
  leadSplitPct: number | null;
};

export type ContactOption = { id: string; full_name: string };
export type CompanyOption = { id: string; name: string };
export type TeamMemberOption = {
  id: string;
  /** Display name — full_name when set, otherwise email. */
  label: string;
};

const DEFAULTS = {
  feeMonths: 1.8,
  feePct: 15,
  retainerPct: 30,
  recruiterSplitPct: 25,
  salaryFrequency: "annual",
} as const;

// Spec: fee_months ↔ fee_pct is salary-frequency-independent —
// it's just the ratio months/(12 months in a year).
function monthsToPct(months: number): number {
  return Math.round((months / 12) * 1000) / 10; // 1 decimal
}
function pctToMonths(pct: number): number {
  return Math.round((pct / 100) * 12 * 100) / 100; // 2 decimals
}

// Annualize the salary midpoint using the same conventions as the
// rest of the codebase. Weekly × 52, monthly × 12, hourly × 2080
// (standard 40h/52w year).
function annualizedSalary(
  midpoint: number,
  frequency: string,
): number {
  switch (frequency) {
    case "annual":
      return midpoint;
    case "monthly":
      return midpoint * 12;
    case "weekly":
      return midpoint * 52;
    case "hourly":
      return midpoint * 2080;
    default:
      return midpoint;
  }
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US")} ${currency}`;
  }
}

export function FeeTermsBlock({
  defaultValues,
  contacts,
  companies,
  teamMembers,
  onChange,
}: {
  defaultValues?: Partial<FeeTermsValues>;
  contacts: ReadonlyArray<ContactOption>;
  companies: ReadonlyArray<CompanyOption>;
  teamMembers: ReadonlyArray<TeamMemberOption>;
  /**
   * Fires on every input change with the current shape of the
   * inputs. Wrapping forms use this to autosave drafts to
   * localStorage — see the new-job form.
   */
  onChange?: (v: FeeTermsValues) => void;
}) {
  const dv = defaultValues ?? {};

  const [feeModel, setFeeModel] = useState<FeeModel>(dv.feeModel ?? "retained");
  const [billingFormat, setBillingFormat] = useState<BillingFormat>(
    dv.billingFormat ?? "factura",
  );
  const [salaryMin, setSalaryMin] = useState<number | null>(dv.salaryMin ?? null);
  const [salaryMax, setSalaryMax] = useState<number | null>(dv.salaryMax ?? null);
  const [salaryCurrency, setSalaryCurrency] = useState<string>(
    dv.salaryCurrency ?? DEFAULT_CURRENCY,
  );
  const [salaryFrequency, setSalaryFrequency] = useState<string>(
    dv.salaryFrequency ?? DEFAULTS.salaryFrequency,
  );

  // Fee inputs — both values stored so we don't lose precision when
  // the user types one and the other rehydrates from it. Defaults
  // are the standard "15% / 1.8 months" pair.
  const [feeMonths, setFeeMonths] = useState<number>(
    dv.feeMonths ?? DEFAULTS.feeMonths,
  );
  const [feePct, setFeePct] = useState<number>(dv.feePct ?? DEFAULTS.feePct);
  const [retainerPct, setRetainerPct] = useState<number>(
    dv.retainerPct ?? DEFAULTS.retainerPct,
  );
  // When the user types an anticipo $ amount directly, we trust it
  // verbatim and back-compute pct from it. This avoids the precision
  // loss that bit users on real numbers — e.g. typing "24,300" only
  // to see it snap to "23,299" because midpoint × fee_pct × pct/100
  // didn't come out clean.
  //
  // Lifecycle:
  //   - null while the user has only been editing the % field, OR
  //     after the fee/salary inputs change (which invalidates a
  //     previously-typed amount).
  //   - a number once the user types an amount; that number drives
  //     the displayed anticipo until the user changes pct or salary.
  const [retainerAmountTyped, setRetainerAmountTyped] = useState<
    number | null
  >(null);
  const [recruiterSplitPct, setRecruiterSplitPct] = useState<number>(
    dv.recruiterSplitPct ?? DEFAULTS.recruiterSplitPct,
  );
  const [recruiterTeamMemberId, setRecruiterTeamMemberId] = useState<string>(
    dv.recruiterTeamMemberId ?? "",
  );

  // Lead recipient. "kind" drives which picker is shown and which
  // hidden input is non-empty on submit.
  type LeadKind = "none" | "contact" | "company";
  const initialLeadKind: LeadKind = dv.leadContactId
    ? "contact"
    : dv.leadCompanyId
      ? "company"
      : "none";
  const [leadKind, setLeadKind] = useState<LeadKind>(initialLeadKind);
  const [leadContactId, setLeadContactId] = useState<string>(
    dv.leadContactId ?? "",
  );
  const [leadCompanyId, setLeadCompanyId] = useState<string>(
    dv.leadCompanyId ?? "",
  );
  const [leadSplitPct, setLeadSplitPct] = useState<number | null>(
    dv.leadSplitPct ?? null,
  );

  // Live derived numbers, recomputed on every input change.
  const midpoint = useMemo(() => {
    if (salaryMin == null || salaryMax == null) return null;
    return (salaryMin + salaryMax) / 2;
  }, [salaryMin, salaryMax]);

  const totalFee = useMemo(() => {
    if (midpoint == null) return null;
    const annual = annualizedSalary(midpoint, salaryFrequency);
    return (annual * feePct) / 100;
  }, [midpoint, salaryFrequency, feePct]);

  // The displayed anticipo prefers the user's last typed amount over
  // the pct-derived value. Only falls back to pct × totalFee when the
  // user has only touched the % field.
  const retainerAmount =
    feeModel === "retained" && totalFee != null
      ? (retainerAmountTyped ?? (totalFee * retainerPct) / 100)
      : null;
  const placementBalance =
    totalFee != null && retainerAmount != null
      ? totalFee - retainerAmount
      : totalFee;

  // Salary or fee % changes invalidate the user's typed amount —
  // those numbers represent a different fee total now, so the typed
  // anticipo would be a stale absolute amount. Drop back to the
  // pct-driven derivation.
  useEffect(() => {
    setRetainerAmountTyped(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salaryMin, salaryMax, salaryFrequency, feePct]);

  // Propagate every input change to the parent so wrapping forms can
  // autosave a draft. The shape mirrors FeeTermsValues exactly.
  useEffect(() => {
    if (!onChange) return;
    onChange({
      feeModel,
      billingFormat,
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryFrequency,
      feeMonths,
      feePct,
      retainerPct,
      recruiterSplitPct,
      recruiterTeamMemberId: recruiterTeamMemberId || null,
      leadContactId: leadKind === "contact" ? leadContactId || null : null,
      leadCompanyId: leadKind === "company" ? leadCompanyId || null : null,
      leadSplitPct: leadKind === "none" ? null : leadSplitPct,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    feeModel,
    billingFormat,
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryFrequency,
    feeMonths,
    feePct,
    retainerPct,
    recruiterSplitPct,
    recruiterTeamMemberId,
    leadKind,
    leadContactId,
    leadCompanyId,
    leadSplitPct,
  ]);

  return (
    <div className="space-y-5 rounded-[10px] border border-border-soft bg-bg-2 p-4">
      <div>
        <Eyebrow>Términos comerciales</Eyebrow>
        <p className="mt-1 text-xs text-fg-muted">
          Sustituye el tracker en Sheets. Todos los montos se calculan
          en vivo a partir del rango salarial.
        </p>
      </div>

      {/* Fee model + billing format ---------------------------------- */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Modelo de fee">
          <SegmentedControl
            name="fee_model"
            value={feeModel}
            onChange={(v) => setFeeModel(v as FeeModel)}
            options={[
              { value: "retained", label: "Con anticipo" },
              { value: "contingent", label: "Al éxito" },
            ]}
          />
        </Field>
        <Field label="Factura">
          <SegmentedControl
            name="billing_format"
            value={billingFormat}
            onChange={(v) => setBillingFormat(v as BillingFormat)}
            options={[
              { value: "factura", label: "Factura (MX)" },
              { value: "invoice", label: "Invoice (US)" },
            ]}
          />
        </Field>
      </div>

      {/* Salary range -------------------------------------------------- */}
      <div>
        <Eyebrow>Rango salarial</Eyebrow>
        <div className="mt-2 grid grid-cols-5 gap-3">
          <Field label="Mínimo">
            <NumberInputWithCommas
              name="salary_min"
              defaultValue={salaryMin}
              onValueChange={setSalaryMin}
            />
          </Field>
          <Field label="Máximo">
            <NumberInputWithCommas
              name="salary_max"
              defaultValue={salaryMax}
              onValueChange={setSalaryMax}
            />
          </Field>
          <Field label="Midpoint">
            <ReadonlyValue>
              {midpoint != null
                ? formatMoney(midpoint, salaryCurrency)
                : "—"}
            </ReadonlyValue>
          </Field>
          <Field label="Moneda">
            <Select
              name="salary_currency"
              value={salaryCurrency}
              onChange={setSalaryCurrency}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Frecuencia">
            <Select
              name="salary_frequency"
              value={salaryFrequency}
              onChange={setSalaryFrequency}
            >
              <option value="annual">Anual</option>
              <option value="monthly">Mensual</option>
              <option value="weekly">Semanal</option>
              <option value="hourly">Por hora</option>
            </Select>
          </Field>
        </div>
      </div>

      {/* Fee + retainer ----------------------------------------------- */}
      <div>
        <Eyebrow>Fee</Eyebrow>
        <div className="mt-2 grid grid-cols-5 gap-3">
          <Field label="Meses">
            <PercentInput
              name="fee_months"
              value={feeMonths}
              decimals={2}
              onChange={(v) => {
                setFeeMonths(v);
                setFeePct(monthsToPct(v));
              }}
              suffix="m"
            />
          </Field>
          <Field label="% del anual">
            <PercentInput
              name="fee_pct"
              value={feePct}
              decimals={1}
              onChange={(v) => {
                setFeePct(v);
                setFeeMonths(pctToMonths(v));
              }}
              suffix="%"
            />
          </Field>
          <Field label="Fee aproximado">
            <ReadonlyValue>
              {totalFee != null
                ? formatMoney(totalFee, salaryCurrency)
                : "—"}
            </ReadonlyValue>
          </Field>
          {feeModel === "retained" ? (
            <>
              <Field label="% anticipo">
                <PercentInput
                  name="retainer_pct"
                  value={retainerPct}
                  decimals={1}
                  onChange={(v) => {
                    setRetainerPct(v);
                    // Editing the pct invalidates the typed amount
                    // override — pct is the new authority.
                    setRetainerAmountTyped(null);
                  }}
                  suffix="%"
                />
              </Field>
              <Field label="Anticipo">
                {/* Bidirectional with retainer_pct. The typed amount
                    is stored as an override (`retainerAmountTyped`)
                    so the user sees back exactly what they typed —
                    no rounding drift from the pct round-trip. pct is
                    kept in sync at 4-decimal precision so the
                    persisted value round-trips cleanly on reload. */}
                <MoneyInput
                  amount={retainerAmount}
                  currency={salaryCurrency}
                  disabled={totalFee == null || totalFee === 0}
                  onChange={(newAmount) => {
                    if (totalFee == null || totalFee === 0) return;
                    setRetainerAmountTyped(newAmount);
                    const pct =
                      newAmount == null ? 0 : (newAmount * 100) / totalFee;
                    // 4 decimals — enough for typed $ amounts up to
                    // 6 digits to round-trip exactly.
                    setRetainerPct(
                      Math.round(Math.min(100, Math.max(0, pct)) * 10000) /
                        10000,
                    );
                  }}
                />
              </Field>
            </>
          ) : (
            // Keep the grid stable when retainer block is hidden.
            <>
              <Spacer />
              <Spacer />
              {/* Send a null retainer_pct on submit so the action
                  knows to clear it when switching to contingent. */}
              <input type="hidden" name="retainer_pct" value="" />
            </>
          )}
        </div>
        {feeModel === "retained" && placementBalance != null ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            Saldo placement: {formatMoney(placementBalance, salaryCurrency)}
          </p>
        ) : null}
      </div>

      {/* Comisiones — sourcer / recruiter, then lead ------------------ */}
      <div>
        <Eyebrow>Comisiones</Eyebrow>
        <div className="mt-2 grid grid-cols-4 gap-3">
          <Field label="Sourcer">
            <Select
              name="recruiter_team_member_id"
              value={recruiterTeamMemberId}
              onChange={setRecruiterTeamMemberId}
            >
              <option value="">Sin asignar</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="% sourcer">
            <PercentInput
              name="recruiter_split_pct"
              value={recruiterSplitPct}
              decimals={1}
              onChange={setRecruiterSplitPct}
              suffix="%"
            />
          </Field>
          <Field label="Lead">
            {/* The Lead picker collapses kind + who into one row:
                the select's first chunk picks the entity, the rest
                of the row picks the specific contact/empresa. */}
            <div className="flex gap-1">
              <Select
                name="lead_kind"
                value={leadKind}
                onChange={(v) => setLeadKind(v as LeadKind)}
              >
                <option value="none">—</option>
                <option value="contact">Contacto</option>
                <option value="company">Empresa</option>
              </Select>
              {leadKind === "contact" ? (
                <Select
                  name="lead_contact_id"
                  value={leadContactId}
                  onChange={setLeadContactId}
                >
                  <option value="">—</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </Select>
              ) : leadKind === "company" ? (
                <Select
                  name="lead_company_id"
                  value={leadCompanyId}
                  onChange={setLeadCompanyId}
                >
                  <option value="">—</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </Field>
          <Field label="% lead">
            {leadKind === "none" ? (
              <ReadonlyValue>—</ReadonlyValue>
            ) : (
              <PercentInput
                name="lead_split_pct"
                value={leadSplitPct ?? 0}
                decimals={1}
                onChange={setLeadSplitPct}
                suffix="%"
              />
            )}
          </Field>
        </div>
        {/* Always send the opposite picker's id as empty so the
            action clears it on switch. */}
        {leadKind !== "contact" ? (
          <input type="hidden" name="lead_contact_id" value="" />
        ) : null}
        {leadKind !== "company" ? (
          <input type="hidden" name="lead_company_id" value="" />
        ) : null}
        {leadKind === "none" ? (
          <input type="hidden" name="lead_split_pct" value="" />
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// Tiny primitives — local, not exported. Keep the block self-contained.
// ============================================================

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-fg-2">{label}</label>
      {children}
    </div>
  );
}

function Spacer() {
  return <div aria-hidden />;
}

function ReadonlyValue({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-border-soft bg-bg-3 px-3 font-mono text-xs tabular-nums text-fg-muted">
      {children}
    </div>
  );
}

function Select({
  name,
  value,
  onChange,
  children,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border bg-bg-1 px-2 text-xs"
    >
      {children}
    </select>
  );
}

function SegmentedControl({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex h-9 rounded-md border border-border bg-bg-1 p-0.5"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={
              "flex-1 rounded px-3 text-xs transition-colors " +
              (active
                ? "bg-fg-1 text-bg-1 font-medium"
                : "text-fg-2 hover:bg-bg-3")
            }
          >
            {o.label}
          </button>
        );
      })}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/**
 * Number input that displays a currency-formatted value (e.g.
 * "$30,000") but emits the bare number through `onChange`. Used by
 * the bidirectional anticipo control — user types a dollar amount,
 * the parent back-computes the % from it.
 *
 * Stays in display-formatted mode when not focused so the user reads
 * a clean money string. On focus we strip the format so editing is
 * frictionless.
 */
function MoneyInput({
  amount,
  currency,
  onChange,
  disabled,
}: {
  amount: number | null;
  currency: string;
  onChange: (next: number | null) => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState<string>(
    amount != null ? String(Math.round(amount)) : "",
  );
  // Keep `raw` in sync with the parent's `amount` whenever we're
  // not focused (so external recalcs — salary change, % change —
  // flow through).
  useEffect(() => {
    if (!focused) {
      setRaw(amount != null ? String(Math.round(amount)) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, focused]);

  const formatted = useMemo(() => {
    if (amount == null) return "";
    try {
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${Math.round(amount).toLocaleString("en-US")} ${currency}`;
    }
  }, [amount, currency]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={focused ? raw : formatted}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const stripped = e.target.value.replace(/[^\d]/g, "");
        setRaw(stripped);
        onChange(stripped === "" ? null : Number(stripped));
      }}
      className="font-mono text-xs tabular-nums"
    />
  );
}

function PercentInput({
  name,
  value,
  decimals,
  onChange,
  suffix,
}: {
  name: string;
  value: number;
  decimals: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        name={name}
        value={Number.isFinite(value) ? value : ""}
        step={Math.pow(10, -decimals).toString()}
        min={0}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(0);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={suffix ? "pr-7" : undefined}
      />
      {suffix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-fg-muted"
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
