"use client";

import { useState, useTransition } from "react";
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

  function persist(patch: Parameters<typeof updateCandidateContactAction>[0]["patch"]) {
    startTransition(async () => {
      const res = await updateCandidateContactAction({
        candidateId,
        patch,
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <dl className="grid grid-cols-1 gap-x-3 gap-y-2 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-3 text-sm @[420px]/inspector:grid-cols-[120px_1fr] @[420px]/inspector:items-center">
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
          <a
            href={`tel:${phone}`}
            className="ml-2 text-[11px] text-muted-foreground hover:text-foreground"
            aria-label={t("candidatesArea.call")}
          >
            {t("candidatesArea.call")}
          </a>
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
