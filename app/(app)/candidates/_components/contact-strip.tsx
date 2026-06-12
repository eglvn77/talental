"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Compass,
  Copy,
  Linkedin,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { LocationAutocomplete } from "@/app/(app)/jobs/new/location-autocomplete";
import { updateCandidateContactAction } from "@/app/(app)/_actions/candidate-profile";
import { useT } from "@/lib/i18n/client";
import type { SourceRow } from "@/lib/hiring";

type Patch = Parameters<typeof updateCandidateContactAction>[0]["patch"];

/**
 * Strip junk placeholder values ("unknown", "n/a", …) so they never
 * render — a missing field shows a dash, not garbage data.
 */
function clean(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  return ["unknown", "n/a", "na", "none", "null", "-"].includes(t.toLowerCase())
    ? null
    : t;
}

/** Normalize a phone to "+digits" — drop spaces, dashes, parens, dots. */
function normalizePhone(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^\d]/g, "");
}

/**
 * Horizontal contact strip at the top of the candidate details tab.
 * THE single home for contact essentials.
 *
 * Every field edits INLINE — click the value (or the dash placeholder
 * for an empty one) and it becomes an input; Enter/blur saves, Esc
 * cancels. No "edit the whole row" button. Phone is normalized on save;
 * email keeps a copy affordance and phone a WhatsApp deep link.
 */
export function ContactStrip({
  candidateId,
  email,
  emailSecondary,
  phone,
  phoneSecondary,
  linkedinUrl,
  location,
  locationPlaceId,
  sourceId,
  sources,
  mapsApiKey,
}: {
  candidateId: string;
  email: string | null;
  emailSecondary: string | null;
  phone: string | null;
  phoneSecondary: string | null;
  linkedinUrl: string | null;
  location: string | null;
  locationPlaceId: string | null;
  sourceId: string | null;
  sources: SourceRow[];
  mapsApiKey: string;
}) {
  const t = useT();
  const router = useRouter();
  const [, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);

  const e = clean(email);
  const e2 = clean(emailSecondary);
  const p = clean(phone);
  const p2 = clean(phoneSecondary);
  const li = clean(linkedinUrl);
  const loc = clean(location);
  const sourceLabel = sources.find((s) => s.id === sourceId)?.label ?? null;
  const waDigits = p ? p.replace(/\D/g, "") : "";

  function persist(patch: Patch) {
    start(async () => {
      const res = await updateCandidateContactAction({ candidateId, patch });
      if (!res.ok) toast.saveFailed(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {/* Email — inline edit + copy. */}
      <span className="inline-flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5 shrink-0" />
        <InlineText
          value={e}
          type="email"
          placeholder={t("candidatesArea.contactEmailPlaceholder")}
          onSave={(v) => persist({ email: v })}
          maxWidth="240px"
        />
        {e ? (
          <button
            type="button"
            title={t("candidatesArea.copy")}
            onClick={() => {
              void navigator.clipboard.writeText(e).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="shrink-0 rounded p-0.5 hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3 w-3 text-positive" />
            ) : (
              <Copy className="h-3 w-3 opacity-50" />
            )}
          </button>
        ) : null}
      </span>

      {/* Secondary email — only an input once present or being added. */}
      {e2 || e ? (
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 shrink-0 opacity-50" />
          <InlineText
            value={e2}
            type="email"
            placeholder={`${t("candidatesArea.contactEmail")} 2`}
            onSave={(v) => persist({ email_secondary: v })}
            maxWidth="200px"
          />
        </span>
      ) : null}

      {/* Phone — inline edit (normalized) + WhatsApp. */}
      <span className="inline-flex items-center gap-1.5">
        <Phone className="h-3.5 w-3.5 shrink-0" />
        <InlineText
          value={p}
          type="tel"
          mono
          placeholder="+525512345678"
          onSave={(v) => persist({ phone: v ? normalizePhone(v) : null })}
          maxWidth="160px"
        />
        {waDigits ? (
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            title="WhatsApp"
            aria-label="WhatsApp"
            className="shrink-0 rounded p-0.5 transition-colors hover:text-[#25D366]"
          >
            <WhatsAppIcon />
          </a>
        ) : null}
      </span>

      {/* Secondary phone. */}
      {p2 || p ? (
        <span className="inline-flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 shrink-0 opacity-50" />
          <InlineText
            value={p2}
            type="tel"
            mono
            placeholder={`${t("candidatesArea.contactPhone")} 2`}
            onSave={(v) =>
              persist({ phone_secondary: v ? normalizePhone(v) : null })
            }
            maxWidth="150px"
          />
        </span>
      ) : null}

      {/* LinkedIn — inline edit; opens the profile when set. */}
      <span className="inline-flex items-center gap-1.5">
        <Linkedin className="h-3.5 w-3.5 shrink-0" />
        {li ? (
          <a
            href={li}
            target="_blank"
            rel="noopener noreferrer"
            title={li}
            className="rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
            onDoubleClick={(ev) => ev.preventDefault()}
          >
            LinkedIn
          </a>
        ) : (
          <InlineText
            value={null}
            type="url"
            placeholder="https://www.linkedin.com/in/…"
            onSave={(v) => persist({ linkedin_url: v })}
            maxWidth="180px"
          />
        )}
      </span>

      {/* Location — inline via the Maps autocomplete on click. */}
      <span className="inline-flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        {editingLocation && mapsApiKey ? (
          <span className="w-[220px]">
            <LocationAutocomplete
              apiKey={mapsApiKey}
              defaultValue={loc ?? ""}
              defaultPlaceId={locationPlaceId ?? undefined}
              onChange={(l) => {
                persist({
                  location: l.location || null,
                  location_place_id: l.placeId || null,
                  location_lat: l.lat && l.lat !== "" ? parseFloat(l.lat) : null,
                  location_lng: l.lng && l.lng !== "" ? parseFloat(l.lng) : null,
                });
                setEditingLocation(false);
              }}
            />
          </span>
        ) : mapsApiKey ? (
          <button
            type="button"
            onClick={() => setEditingLocation(true)}
            className="max-w-[200px] truncate rounded px-1 -mx-1 py-0.5 text-left transition-colors hover:bg-muted hover:text-foreground"
          >
            {loc ?? "–"}
          </button>
        ) : (
          <InlineText
            value={loc}
            type="text"
            placeholder={t("candidatesArea.contactLocation")}
            onSave={(v) => persist({ location: v })}
            maxWidth="200px"
          />
        )}
      </span>

      {/* Source — inline select. */}
      {sources.length > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <Compass className="h-3.5 w-3.5 shrink-0" />
          <SourceSelect
            value={sourceId}
            label={sourceLabel}
            sources={sources}
            onSave={(v) => persist({ source_id: v })}
            noneLabel={t("sourcesCfg.none")}
          />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Click the value (or the "–" placeholder) to edit it inline. Enter or
 * blur commits; Esc reverts. Renders a plain button in read mode so the
 * strip stays compact.
 */
function InlineText({
  value,
  type,
  placeholder,
  mono = false,
  maxWidth,
  onSave,
}: {
  value: string | null;
  type: "email" | "tel" | "url" | "text";
  placeholder?: string;
  mono?: boolean;
  maxWidth?: string;
  onSave: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === (value ?? "")) return;
    onSave(next || null);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={commit}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            commit();
          } else if (ev.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        style={maxWidth ? { width: maxWidth } : undefined}
        className={
          "h-6 rounded border border-border bg-background px-1.5 text-xs" +
          (mono ? " font-mono" : "")
        }
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      style={maxWidth ? { maxWidth } : undefined}
      className={
        "truncate rounded px-1 -mx-1 py-0.5 text-left transition-colors hover:bg-muted hover:text-foreground" +
        (mono && value ? " font-mono" : "")
      }
      title={value ?? placeholder}
    >
      {value ?? "–"}
    </button>
  );
}

function SourceSelect({
  value,
  label,
  sources,
  onSave,
  noneLabel,
}: {
  value: string | null;
  label: string | null;
  sources: SourceRow[];
  onSave: (value: string | null) => void;
  noneLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <span className="w-44">
        <Select
          value={value ?? ""}
          onChange={(v) => {
            onSave(v || null);
            setEditing(false);
          }}
          options={[
            { value: "", label: noneLabel },
            ...sources.map((s) => ({ value: s.id, label: s.label })),
          ]}
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
    >
      {label ?? "–"}
    </button>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.42 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
    </svg>
  );
}
