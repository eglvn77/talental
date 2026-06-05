"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Compass,
  Copy,
  DollarSign,
  ExternalLink,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { enrichCandidateFromLinkedinAction } from "@/app/(app)/actions";
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
        <ReadMode candidateId={candidateId} initial={initial} sources={sources} t={t} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- read

function ReadMode({
  candidateId,
  initial,
  sources,
  t,
}: {
  candidateId: string;
  initial: Initial;
  sources: SourceRow[];
  t: ReturnType<typeof useT>;
}) {
  const sourceLabel =
    sources.find((s) => s.id === initial.source_id)?.label ?? null;
  return (
    <dl className="divide-y divide-border/60">
      {/* Source keeps a text label — the compass icon alone isn't
          self-explanatory. */}
      <Row icon={<Compass className="h-3.5 w-3.5" />} label={t("sourcesCfg.fieldLabel")}>
        <Value text={sourceLabel} />
      </Row>
      <Row icon={<MapPin className="h-3.5 w-3.5" />}>
        <Value text={initial.location} />
      </Row>

      {/* Email — clickable mailto. */}
      <Row icon={<Mail className="h-3.5 w-3.5" />}>
        <LinkValue href={initial.email ? `mailto:${initial.email}` : null} text={initial.email} />
      </Row>
      {initial.email_secondary ? (
        <Row icon={<Mail className="h-3.5 w-3.5 opacity-40" />}>
          <LinkValue href={`mailto:${initial.email_secondary}`} text={initial.email_secondary} />
        </Row>
      ) : null}

      {/* Phone — clickable tel + WhatsApp. */}
      <Row
        icon={<Phone className="h-3.5 w-3.5" />}
        action={initial.phone ? <WhatsAppButton phone={initial.phone} label={t("candidatesArea.whatsapp")} /> : undefined}
      >
        <LinkValue href={initial.phone ? `tel:${initial.phone}` : null} text={initial.phone} mono />
      </Row>
      {initial.phone_secondary ? (
        <Row
          icon={<Phone className="h-3.5 w-3.5 opacity-40" />}
          action={<WhatsAppButton phone={initial.phone_secondary} label={t("candidatesArea.whatsapp")} />}
        >
          <LinkValue href={`tel:${initial.phone_secondary}`} text={initial.phone_secondary} mono />
        </Row>
      ) : null}

      {/* LinkedIn — show the URL text + enrich + open + copy icons. */}
      <Row
        icon={<Linkedin className="h-3.5 w-3.5" />}
        action={
          initial.linkedin_url ? (
            <div className="flex items-center gap-0.5">
              <EnrichButton candidateId={candidateId} />
              <CopyButton value={initial.linkedin_url} label={t("candidatesArea.copy")} />
              <a
                href={initial.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("candidatesArea.linkedinProfile")}
                title={t("candidatesArea.linkedinProfile")}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : undefined
        }
      >
        <Value text={initial.linkedin_url} />
      </Row>

      <Row icon={<DollarSign className="h-3.5 w-3.5" />} label={t("candidatesArea.compCurrentShort")}>
        <Value text={fmtMoney(initial.comp_current_amount, initial.comp_current_currency)} />
      </Row>
      <Row icon={<DollarSign className="h-3.5 w-3.5" />} label={t("candidatesArea.compExpectedShort")}>
        <Value text={fmtMoney(initial.comp_expected_amount, initial.comp_expected_currency)} />
      </Row>
    </dl>
  );
}

function Row({
  icon,
  label,
  action,
  children,
}: {
  icon: React.ReactNode;
  label?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      {label ? (
        <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}

function Value({ text, mono = false }: { text: string | null; mono?: boolean }) {
  if (!text) return <span className="text-sm text-muted-foreground/50">—</span>;
  return (
    <span className={cn("block truncate text-sm", mono && "font-mono")}>{text}</span>
  );
}

function LinkValue({
  href,
  text,
  mono = false,
}: {
  href: string | null;
  text: string | null;
  mono?: boolean;
}) {
  if (!text || !href) return <Value text={text} mono={mono} />;
  return (
    <a
      href={href}
      className={cn(
        "block truncate text-sm text-foreground hover:text-accent hover:underline",
        mono && "font-mono",
      )}
    >
      {text}
    </a>
  );
}

function WhatsAppButton({ phone, label }: { phone: string; label: string }) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-[#25D366]"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.42 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
      </svg>
    </a>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-positive" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
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

/**
 * Triggers a Coresignal enrichment for this candidate. The server
 * action does its own freshness check (90-day TTL) — we just fire
 * and refresh. Toast confirms cached vs live.
 */
function EnrichButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onClick() {
    setBusy(true);
    try {
      const res = await enrichCandidateFromLinkedinAction({ candidateId });
      if (!res.ok) {
        toast.actionFailed("Enrich", res.error);
        return;
      }
      toast.actionOk(res.data.cached ? "Enriched (cached)" : "Enriched");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Enrich from LinkedIn"
      title="Enrich from LinkedIn"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
