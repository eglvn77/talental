"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Compass,
  DollarSign,
  ExternalLink,
  Linkedin,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { LocationAutocomplete } from "@/app/(app)/jobs/new/location-autocomplete";
import { updateCandidateContactAction } from "@/app/(app)/_actions/candidate-profile";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currencies";
import type { SourceRow } from "@/lib/hiring";

type Patch = Parameters<typeof updateCandidateContactAction>[0]["patch"];

type Initial = {
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

/**
 * Condensed contact/comp inspector. Read-only by default (icon + value
 * per row, no field labels) so a stray click can't wipe a value;
 * clicking the pencil flips the card into edit mode where fields
 * autosave on blur. Secondary email/phone are added with a bare "+".
 */
export function CandidateInspector({
  candidateId,
  initial,
  sources,
  mapsApiKey,
}: {
  candidateId: string;
  initial: Initial;
  sources: SourceRow[];
  mapsApiKey: string;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();

  function persist(patch: Patch) {
    start(async () => {
      const res = await updateCandidateContactAction({ candidateId, patch });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <div className="space-y-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("candidatesArea.contactSection")}
        </span>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {editing ? (
            <>
              <Check className="h-3 w-3" />
              {t("candidatesArea.done")}
            </>
          ) : (
            <>
              <Pencil className="h-3 w-3" />
              {t("common.edit")}
            </>
          )}
        </button>
      </div>

      {editing ? (
        <EditMode
          initial={initial}
          sources={sources}
          mapsApiKey={mapsApiKey}
          persist={persist}
        />
      ) : (
        <ReadMode initial={initial} sources={sources} t={t} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- read

function ReadMode({
  initial,
  sources,
  t,
}: {
  initial: Initial;
  sources: SourceRow[];
  t: ReturnType<typeof useT>;
}) {
  const sourceLabel =
    sources.find((s) => s.id === initial.source_id)?.label ?? null;
  return (
    <dl className="divide-y divide-border/60">
      <Row icon={<Compass className="h-3.5 w-3.5" />}>
        <Value text={sourceLabel} />
      </Row>
      <Row icon={<MapPin className="h-3.5 w-3.5" />}>
        <Value text={initial.location} />
      </Row>
      <Row icon={<Mail className="h-3.5 w-3.5" />}>
        <Value text={initial.email} mono={false} />
      </Row>
      {initial.email_secondary ? (
        <Row icon={<Mail className="h-3.5 w-3.5 opacity-40" />}>
          <Value text={initial.email_secondary} />
        </Row>
      ) : null}
      <Row icon={<Phone className="h-3.5 w-3.5" />}>
        <Value text={initial.phone} mono />
      </Row>
      {initial.phone_secondary ? (
        <Row icon={<Phone className="h-3.5 w-3.5 opacity-40" />}>
          <Value text={initial.phone_secondary} mono />
        </Row>
      ) : null}
      <Row icon={<Linkedin className="h-3.5 w-3.5" />}>
        {initial.linkedin_url ? (
          <a
            href={initial.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1 truncate text-sm text-foreground hover:text-accent hover:underline"
          >
            <span className="truncate">{t("candidatesArea.linkedinProfile")}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <Value text={null} />
        )}
      </Row>
      <Row icon={<DollarSign className="h-3.5 w-3.5" />} hint={t("candidatesArea.compCurrentShort")}>
        <Value text={fmtMoney(initial.comp_current_amount, initial.comp_current_currency)} />
      </Row>
      <Row icon={<DollarSign className="h-3.5 w-3.5" />} hint={t("candidatesArea.compExpectedShort")}>
        <Value text={fmtMoney(initial.comp_expected_amount, initial.comp_expected_currency)} />
      </Row>
    </dl>
  );
}

function Row({
  icon,
  hint,
  children,
}: {
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="shrink-0 text-muted-foreground/70" title={hint}>
        {icon}
      </span>
      {hint ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/60">
          {hint}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 text-right">{children}</div>
    </div>
  );
}

function Value({ text, mono = false }: { text: string | null; mono?: boolean }) {
  if (!text) return <span className="text-sm text-muted-foreground/50">—</span>;
  return (
    <span className={cn("truncate text-sm", mono && "font-mono")}>{text}</span>
  );
}

function fmtMoney(amount: number | null, currency: string | null): string | null {
  if (amount === null || amount === undefined) return null;
  return `${amount.toLocaleString("en-US")} ${currency || DEFAULT_CURRENCY}`;
}

// ---------------------------------------------------------------- edit

const INPUT =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-sm";

function EditMode({
  initial,
  sources,
  mapsApiKey,
  persist,
}: {
  initial: Initial;
  sources: SourceRow[];
  mapsApiKey: string;
  persist: (patch: Patch) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <EditRow icon={<Compass className="h-3.5 w-3.5" />}>
        <Select
          value={initial.source_id ?? ""}
          onChange={(v) => persist({ source_id: v || null })}
          options={[
            { value: "", label: t("sourcesCfg.none") },
            ...sources.map((s) => ({ value: s.id, label: s.label })),
          ]}
        />
      </EditRow>

      <EditRow icon={<MapPin className="h-3.5 w-3.5" />}>
        <LocationField
          mapsApiKey={mapsApiKey}
          initialLocation={initial.location}
          initialPlaceId={initial.location_place_id}
          onPersist={persist}
        />
      </EditRow>

      <EmailOrPhone
        icon={<Mail className="h-3.5 w-3.5" />}
        type="email"
        primary={initial.email}
        secondary={initial.email_secondary}
        placeholder={t("candidatesArea.contactEmailPlaceholder")}
        addLabel={t("candidatesArea.addSecondaryEmail")}
        onPrimary={(v) => persist({ email: v })}
        onSecondary={(v) => persist({ email_secondary: v })}
      />

      <EmailOrPhone
        icon={<Phone className="h-3.5 w-3.5" />}
        type="tel"
        mono
        primary={initial.phone}
        secondary={initial.phone_secondary}
        placeholder="+525512345678"
        addLabel={t("candidatesArea.addSecondaryPhone")}
        onPrimary={(v) => persist({ phone: v })}
        onSecondary={(v) => persist({ phone_secondary: v })}
      />

      <EditRow icon={<Linkedin className="h-3.5 w-3.5" />}>
        <Text
          type="url"
          initial={initial.linkedin_url}
          placeholder="https://www.linkedin.com/in/…"
          onSave={(v) => persist({ linkedin_url: v })}
        />
      </EditRow>

      <EditRow icon={<DollarSign className="h-3.5 w-3.5" />} hint={t("candidatesArea.compCurrentShort")}>
        <Money
          amount={initial.comp_current_amount}
          currency={initial.comp_current_currency}
          onSave={(a, c) => persist({ comp_current_amount: a, comp_current_currency: c })}
        />
      </EditRow>
      <EditRow icon={<DollarSign className="h-3.5 w-3.5" />} hint={t("candidatesArea.compExpectedShort")}>
        <Money
          amount={initial.comp_expected_amount}
          currency={initial.comp_expected_currency}
          onSave={(a, c) => persist({ comp_expected_amount: a, comp_expected_currency: c })}
        />
      </EditRow>
    </div>
  );
}

function EditRow({
  icon,
  hint,
  children,
}: {
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground/70" title={hint}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function EmailOrPhone({
  icon,
  type,
  primary,
  secondary,
  placeholder,
  addLabel,
  mono = false,
  onPrimary,
  onSecondary,
}: {
  icon: React.ReactNode;
  type: "email" | "tel";
  primary: string | null;
  secondary: string | null;
  placeholder?: string;
  addLabel: string;
  mono?: boolean;
  onPrimary: (v: string | null) => void;
  onSecondary: (v: string | null) => void;
}) {
  const [showSecondary, setShowSecondary] = useState(Boolean(secondary));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-muted-foreground/70">{icon}</span>
        <div className="min-w-0 flex-1">
          <Text type={type} initial={primary} placeholder={placeholder} mono={mono} onSave={onPrimary} />
        </div>
        {!showSecondary ? (
          <button
            type="button"
            onClick={() => setShowSecondary(true)}
            aria-label={addLabel}
            title={addLabel}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {showSecondary ? (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-muted-foreground/40">{icon}</span>
          <div className="min-w-0 flex-1">
            <Text type={type} initial={secondary} placeholder={placeholder} mono={mono} onSave={onSecondary} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Text({
  type,
  initial,
  placeholder,
  mono = false,
  onSave,
}: {
  type: "email" | "tel" | "url" | "text";
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

function Money({
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
        className="w-[84px] shrink-0"
        searchable
      />
    </div>
  );
}
