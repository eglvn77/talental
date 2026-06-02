"use client";

import { useState, useTransition } from "react";
import {
  Compass,
  DollarSign,
  ExternalLink,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Plus,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { LocationAutocomplete } from "@/app/(app)/jobs/new/location-autocomplete";
import { updateCandidateContactAction } from "@/app/(app)/_actions/candidate-profile";
import { useT } from "@/lib/i18n/client";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currencies";
import type { SourceRow } from "@/lib/hiring";

type Patch = Parameters<typeof updateCandidateContactAction>[0]["patch"];

/**
 * Right-column inspector for the candidate Detalles tab. Source,
 * location, primary + optional secondary email/phone, and structured
 * compensation. Every field autosaves on blur (only when changed);
 * secondary contacts stay hidden until the recruiter adds them.
 */
export function CandidateInspector({
  candidateId,
  initial,
  sources,
  mapsApiKey,
}: {
  candidateId: string;
  initial: {
    email: string | null;
    email_secondary: string | null;
    phone: string | null;
    phone_secondary: string | null;
    linkedin_url: string | null;
    location: string | null;
    location_place_id: string | null;
    source_id: string | null;
    comp_current_amount: number | null;
    comp_current_currency: string | null;
    comp_expected_amount: number | null;
    comp_expected_currency: string | null;
  };
  sources: SourceRow[];
  mapsApiKey: string;
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
    <dl className="grid grid-cols-1 gap-y-3 text-sm">
      {/* Source */}
      {sources.length > 0 ? (
        <Field icon={<Compass className="h-3 w-3" />} label={t("sourcesCfg.fieldLabel")}>
          <Select
            value={initial.source_id ?? ""}
            onChange={(v) => persist({ source_id: v || null })}
            options={[
              { value: "", label: t("sourcesCfg.none") },
              ...sources.map((s) => ({ value: s.id, label: s.label })),
            ]}
          />
        </Field>
      ) : null}

      {/* Location */}
      <Field icon={<MapPin className="h-3 w-3" />} label={t("candidatesArea.contactLocation")}>
        <LocationField
          mapsApiKey={mapsApiKey}
          initialLocation={initial.location}
          initialPlaceId={initial.location_place_id}
          onPersist={persist}
        />
      </Field>

      {/* Email primary (+ optional secondary) */}
      <Field icon={<Mail className="h-3 w-3" />} label={t("candidatesArea.contactEmail")}>
        <TextField
          type="email"
          initial={initial.email}
          placeholder={t("candidatesArea.contactEmailPlaceholder")}
          onSave={(v) => persist({ email: v })}
        />
        <SecondaryRow
          icon={<Mail className="h-3 w-3" />}
          type="email"
          initial={initial.email_secondary}
          addLabel={t("candidatesArea.addSecondaryEmail")}
          placeholder={t("candidatesArea.contactEmailPlaceholder")}
          onSave={(v) => persist({ email_secondary: v })}
        />
      </Field>

      {/* Phone primary (+ optional secondary) */}
      <Field icon={<Phone className="h-3 w-3" />} label={t("candidatesArea.contactPhone")}>
        <TextField
          type="tel"
          mono
          initial={initial.phone}
          placeholder="+525512345678"
          onSave={(v) => persist({ phone: v })}
        />
        <SecondaryRow
          icon={<Phone className="h-3 w-3" />}
          type="tel"
          mono
          initial={initial.phone_secondary}
          addLabel={t("candidatesArea.addSecondaryPhone")}
          placeholder="+525512345678"
          onSave={(v) => persist({ phone_secondary: v })}
        />
      </Field>

      {/* LinkedIn */}
      <Field icon={<Linkedin className="h-3 w-3" />} label={t("candidatesArea.contactLinkedin")}>
        <LinkedinField
          initial={initial.linkedin_url}
          onSave={(v) => persist({ linkedin_url: v })}
        />
      </Field>

      {/* Compensation */}
      <Field icon={<DollarSign className="h-3 w-3" />} label={t("candidatesArea.compCurrent")}>
        <MoneyField
          amount={initial.comp_current_amount}
          currency={initial.comp_current_currency}
          onSave={(amount, currency) =>
            persist({
              comp_current_amount: amount,
              comp_current_currency: currency,
            })
          }
        />
      </Field>
      <Field icon={<DollarSign className="h-3 w-3" />} label={t("candidatesArea.compExpected")}>
        <MoneyField
          amount={initial.comp_expected_amount}
          currency={initial.comp_expected_currency}
          onSave={(amount, currency) =>
            persist({
              comp_expected_amount: amount,
              comp_expected_currency: currency,
            })
          }
        />
      </Field>
    </dl>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 space-y-1.5">{children}</dd>
    </div>
  );
}

const INPUT =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-sm";

function TextField({
  type,
  initial,
  placeholder,
  mono = false,
  onSave,
}: {
  type: "email" | "tel" | "text";
  initial: string | null;
  placeholder?: string;
  mono?: boolean;
  onSave: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if ((value || "") !== (initial ?? "")) onSave(value || null);
      }}
      className={mono ? `${INPUT} font-mono` : INPUT}
    />
  );
}

function SecondaryRow({
  icon,
  type,
  initial,
  addLabel,
  placeholder,
  mono = false,
  onSave,
}: {
  icon: React.ReactNode;
  type: "email" | "tel";
  initial: string | null;
  addLabel: string;
  placeholder?: string;
  mono?: boolean;
  onSave: (value: string | null) => void;
}) {
  // Hidden until present; "add" reveals the field. Once revealed it
  // behaves like the primary (autosave on blur).
  const [shown, setShown] = useState(Boolean(initial));
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        {addLabel}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground/50">{icon}</span>
      <TextField
        type={type}
        initial={initial}
        placeholder={placeholder}
        mono={mono}
        onSave={onSave}
      />
    </div>
  );
}

function LinkedinField({
  initial,
  onSave,
}: {
  initial: string | null;
  onSave: (value: string | null) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initial ?? "");
  return (
    <div className="flex items-center gap-2">
      <input
        type="url"
        value={value}
        placeholder="https://www.linkedin.com/in/…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if ((value || "") !== (initial ?? "")) onSave(value || null);
        }}
        className={INPUT}
      />
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={t("candidatesArea.openLinkedin")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}

function LocationField({
  mapsApiKey,
  initialLocation,
  initialPlaceId,
  onPersist,
}: {
  mapsApiKey: string;
  initialLocation: string | null;
  initialPlaceId: string | null;
  onPersist: (patch: Patch) => void;
}) {
  const t = useT();
  const [location, setLocation] = useState(initialLocation ?? "");
  if (mapsApiKey) {
    return (
      <LocationAutocomplete
        apiKey={mapsApiKey}
        defaultValue={location}
        defaultPlaceId={initialPlaceId ?? undefined}
        onChange={(loc) => {
          setLocation(loc.location);
          onPersist({
            location: loc.location || null,
            location_place_id: loc.placeId || null,
            location_lat: loc.lat && loc.lat !== "" ? parseFloat(loc.lat) : null,
            location_lng: loc.lng && loc.lng !== "" ? parseFloat(loc.lng) : null,
          });
        }}
      />
    );
  }
  return (
    <input
      type="text"
      value={location}
      placeholder={t("candidatesArea.cityCountryPlaceholder")}
      onChange={(e) => setLocation(e.target.value)}
      onBlur={() => {
        if ((location || "") !== (initialLocation ?? "")) {
          onPersist({ location: location || null });
        }
      }}
      className={INPUT}
    />
  );
}

function MoneyField({
  amount,
  currency,
  onSave,
}: {
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
    <div className="flex items-center gap-1.5">
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
        className={`${INPUT} flex-1`}
      />
      <Select
        value={cur}
        onChange={(v) => {
          setCur(v);
          commit(raw, v);
        }}
        options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
        className="w-[88px] shrink-0"
        searchable
      />
    </div>
  );
}
