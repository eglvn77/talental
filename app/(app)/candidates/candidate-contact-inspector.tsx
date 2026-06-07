"use client";

import { useRef, useState, useTransition } from "react";
import { Compass, ExternalLink, Linkedin, Mail, MapPin, Phone } from "lucide-react";
import { toast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { LocationAutocomplete } from "@/app/(app)/jobs/new/location-autocomplete";
import { updateCandidateContactAction } from "@/app/(app)/_actions/candidate-profile";
import { useT } from "@/lib/i18n/client";
import type { SourceRow } from "@/lib/hiring";

/**
 * Always-visible inspector for a candidate's contact fields. Every
 * row renders even when the underlying value is empty — recruiters
 * can fill it in directly without diving into an edit dialog.
 *
 * Layout: Linear/Notion-style label + value grid. Edits autosave
 * on blur (only when the value actually changed). Errors toast.
 */
export function CandidateContactInspector({
  candidateId,
  initial,
  mapsApiKey,
  sources = [],
  sourceId,
}: {
  candidateId: string;
  initial: {
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    location: string | null;
    location_place_id: string | null;
  };
  mapsApiKey: string;
  /** Candidate-scope Source/Origen options + current value. */
  sources?: SourceRow[];
  sourceId?: string | null;
}) {
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [linkedin, setLinkedin] = useState(initial.linkedin_url ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [, startTransition] = useTransition();
  const t = useT();

  // Debounce + merge contact patches. Tabbing across email → phone →
  // linkedin previously fired three separate Server Actions back-to-
  // back. Now they coalesce into a single round-trip with the merged
  // patch. The Server Action signature is unchanged (it already
  // accepts a partial patch).
  type Patch = Parameters<typeof updateCandidateContactAction>[0]["patch"];
  const pendingPatch = useRef<Patch>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(patch: Patch) {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      const merged = pendingPatch.current;
      pendingPatch.current = {};
      flushTimer.current = null;
      startTransition(async () => {
        const res = await updateCandidateContactAction({
          candidateId,
          patch: merged,
        });
        if (!res.ok) toast.saveFailed(res.error);
      });
    }, 400);
  }

  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm @[420px]/inspector:grid-cols-[120px_1fr] @[420px]/inspector:items-center">
      <Row icon={<Mail className="h-3 w-3" />} label={t("candidatesArea.contactEmail")}>
        <input
          type="email"
          value={email}
          placeholder={t("candidatesArea.contactEmailPlaceholder")}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => {
            if ((email || "") !== (initial.email ?? "")) {
              persist({ email: email || null });
            }
          }}
          className="h-8 w-full max-w-md rounded-md border border-border bg-background px-2 text-sm"
        />
      </Row>

      <Row icon={<Phone className="h-3 w-3" />} label={t("candidatesArea.contactPhone")}>
        <input
          type="tel"
          value={phone}
          placeholder="+525512345678"
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => {
            if ((phone || "") !== (initial.phone ?? "")) {
              persist({ phone: phone || null });
            }
          }}
          className="h-8 w-full max-w-md rounded-md border border-border bg-background px-2 font-mono text-sm"
        />
        {phone ? (
          <>
            <a
              href={`tel:${phone}`}
              className="ml-2 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label={t("candidatesArea.call")}
            >
              {t("candidatesArea.call")}
            </a>
            <WhatsAppLink phone={phone} label={t("candidatesArea.whatsapp")} />
          </>
        ) : null}
      </Row>

      <Row icon={<Linkedin className="h-3 w-3" />} label={t("candidatesArea.contactLinkedin")}>
        <div className="flex w-full max-w-md items-center gap-2">
          <input
            type="url"
            value={linkedin}
            placeholder="https://www.linkedin.com/in/…"
            onChange={(e) => setLinkedin(e.target.value)}
            onBlur={() => {
              if ((linkedin || "") !== (initial.linkedin_url ?? "")) {
                persist({ linkedin_url: linkedin || null });
              }
            }}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
          />
          {linkedin ? (
            <a
              href={linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t("candidatesArea.openLinkedin")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </Row>

      <Row icon={<MapPin className="h-3 w-3" />} label={t("candidatesArea.contactLocation")}>
        <div className="w-full max-w-md">
          {mapsApiKey ? (
            <LocationAutocomplete
              apiKey={mapsApiKey}
              defaultValue={location}
              defaultPlaceId={initial.location_place_id ?? undefined}
              onChange={(loc) => {
                setLocation(loc.location);
                persist({
                  location: loc.location || null,
                  location_place_id: loc.placeId || null,
                  location_lat:
                    loc.lat && loc.lat !== "" ? parseFloat(loc.lat) : null,
                  location_lng:
                    loc.lng && loc.lng !== "" ? parseFloat(loc.lng) : null,
                });
              }}
            />
          ) : (
            <input
              type="text"
              value={location}
              placeholder={t("candidatesArea.cityCountryPlaceholder")}
              onChange={(e) => setLocation(e.target.value)}
              onBlur={() => {
                if ((location || "") !== (initial.location ?? "")) {
                  persist({ location: location || null });
                }
              }}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
          )}
        </div>
      </Row>
      {sources.length > 0 ? (
        <Row icon={<Compass className="h-3 w-3" />} label={t("sourcesCfg.fieldLabel")}>
          <div className="w-full max-w-md">
            <Select
              value={sourceId ?? ""}
              onChange={(v) => persist({ source_id: v || null })}
              options={[
                { value: "", label: t("sourcesCfg.none") },
                ...sources.map((s) => ({ value: s.id, label: s.label })),
              ]}
            />
          </div>
        </Row>
      ) : null}
    </dl>
  );
}

function WhatsAppLink({ phone, label }: { phone: string; label: string }) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-[#25D366]"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.42 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
      </svg>
    </a>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </dt>
      <dd className="flex items-center min-w-0">{children}</dd>
    </>
  );
}
