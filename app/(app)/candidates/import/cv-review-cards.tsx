"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  FileText,
  GraduationCap,
  Languages,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import type {
  ParsedCv,
  ParsedCvExperience,
  ParsedCvEducation,
} from "@/lib/cv-parser/types";
import { findExistingCandidatesByEmailAction } from "@/app/(app)/_actions/cv-import";
import { LocationAutocomplete } from "@/app/(app)/jobs/new/location-autocomplete";

/**
 * Step 2 of the CV import wizard: per-candidate preview cards with
 * editable fields + duplicate detection.
 *
 * Inputs come from the step-1 wizard. Each parsed CV gets one card.
 * Recruiter can:
 *   - Edit any field inline (name, email, headline, summary,
 *     location, current company/position).
 *   - Tweak experience entries (company, position, dates, description).
 *   - Toggle the action per card:
 *       New row exists in DB                    Default
 *       ─────────────────────────────────────  ────────
 *       No                                      "create"  (checkbox on)
 *       Yes                                     "update" | "create_new" | "skip"
 *
 * Save is wired in COMMIT 4.
 */

export type CvCard = {
  id: string;
  file_name: string;
  parsed: ParsedCv;
  action: CardAction;
  /** When duplicates exist for this card's email. */
  existing?: ExistingMatch;
  /** Filled when the recruiter picked a city from the Google Places
   *  autocomplete. Plain-text edits leave these null and rely on
   *  parsed.location alone. */
  location_place_id?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
};

export type CardAction = "create" | "update" | "create_new" | "skip";

export type ExistingMatch = {
  id: string;
  email: string;
  full_name: string;
  linkedin_url: string | null;
};

export function CvReviewCards({
  initial,
  onBack,
  onSave,
  saving = false,
  mapsApiKey,
}: {
  initial: CvCard[];
  onBack: () => void;
  onSave: (cards: CvCard[]) => void | Promise<void>;
  saving?: boolean;
  mapsApiKey: string;
}) {
  const [cards, setCards] = useState<CvCard[]>(initial);
  const [dedupRunning, setDedupRunning] = useState(true);

  // ----- Dedup probe on mount -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const emails = cards
        .map((c) => c.parsed.email)
        .filter((e): e is string => Boolean(e?.trim()));
      if (emails.length === 0) {
        if (!cancelled) setDedupRunning(false);
        return;
      }
      const res = await findExistingCandidatesByEmailAction(emails);
      if (cancelled) return;
      if (!res.ok) {
        toast.actionFailed("No pude verificar duplicados", res.error);
        setDedupRunning(false);
        return;
      }
      const byEmail = new Map<string, ExistingMatch>();
      for (const m of res.data.matches) {
        byEmail.set(m.email.toLowerCase(), m);
      }
      setCards((prev) =>
        prev.map((c) => {
          const e = c.parsed.email?.trim().toLowerCase();
          const match = e ? byEmail.get(e) : undefined;
          if (!match) return c;
          return { ...c, existing: match, action: "update" };
        }),
      );
      setDedupRunning(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Per-card updates -----
  function updateCard(id: string, patch: Partial<CvCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function updateParsed(id: string, patch: Partial<ParsedCv>) {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, parsed: { ...c.parsed, ...patch } } : c,
      ),
    );
  }

  function updateExperience(id: string, index: number, patch: Partial<ParsedCvExperience>) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = c.parsed.experience.map((e, i) =>
          i === index ? { ...e, ...patch } : e,
        );
        return { ...c, parsed: { ...c.parsed, experience: next } };
      }),
    );
  }

  function updateEducation(id: string, index: number, patch: Partial<ParsedCvEducation>) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = c.parsed.education.map((e, i) =>
          i === index ? { ...e, ...patch } : e,
        );
        return { ...c, parsed: { ...c.parsed, education: next } };
      }),
    );
  }

  // ----- Counts for the footer -----
  const counts = useMemo(() => {
    let creating = 0;
    let updating = 0;
    let skipping = 0;
    for (const c of cards) {
      if (c.action === "create" || c.action === "create_new") creating += 1;
      else if (c.action === "update") updating += 1;
      else skipping += 1;
    }
    return { creating, updating, skipping };
  }, [cards]);

  function handleSave() {
    const actionable = cards.filter((c) => c.action !== "skip");
    if (actionable.length === 0) {
      toast.actionFailed("No hay candidatos seleccionados para guardar.");
      return;
    }
    onSave(cards);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al parseo
        </Button>
        {dedupRunning ? (
          <span className="text-xs text-muted-foreground">
            Verificando duplicados…
          </span>
        ) : null}
      </div>

      <ul className="space-y-4">
        {cards.map((card) => (
          <li key={card.id}>
            <CardEditor
              card={card}
              mapsApiKey={mapsApiKey}
              onActionChange={(a) => updateCard(card.id, { action: a })}
              onParsedChange={(p) => updateParsed(card.id, p)}
              onLocationPick={(loc) =>
                updateCard(card.id, {
                  location_place_id: loc.placeId || null,
                  location_lat:
                    loc.lat && loc.lat !== ""
                      ? parseFloat(loc.lat)
                      : null,
                  location_lng:
                    loc.lng && loc.lng !== ""
                      ? parseFloat(loc.lng)
                      : null,
                  parsed: { ...card.parsed, location: loc.location || null },
                })
              }
              onExperienceChange={(i, p) =>
                updateExperience(card.id, i, p)
              }
              onEducationChange={(i, p) => updateEducation(card.id, i, p)}
            />
          </li>
        ))}
      </ul>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-modal">
        <span className="text-muted-foreground">
          {counts.creating} crear · {counts.updating} actualizar ·{" "}
          {counts.skipping} omitir
        </span>
        <Button onClick={handleSave} disabled={saving}>
          {saving
            ? "Guardando…"
            : `Guardar ${counts.creating + counts.updating}`}
        </Button>
      </div>
    </div>
  );
}

// =========================================================
// One card per parsed CV
// =========================================================

function CardEditor({
  card,
  mapsApiKey,
  onActionChange,
  onParsedChange,
  onLocationPick,
  onExperienceChange,
  onEducationChange,
}: {
  card: CvCard;
  mapsApiKey: string;
  onActionChange: (a: CardAction) => void;
  onParsedChange: (patch: Partial<ParsedCv>) => void;
  onLocationPick: (loc: {
    location: string;
    placeId: string;
    lat: string;
    lng: string;
  }) => void;
  onExperienceChange: (i: number, patch: Partial<ParsedCvExperience>) => void;
  onEducationChange: (i: number, patch: Partial<ParsedCvEducation>) => void;
}) {
  const skipped = card.action === "skip";
  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-card p-4 transition-opacity",
        skipped && "opacity-50",
      )}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <FileText
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {card.file_name}
            </div>
            {card.existing ? (
              <span className="mt-0.5 inline-flex items-center gap-1.5 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                Ya existe — {card.existing.full_name}
              </span>
            ) : (
              <span className="mt-0.5 inline-flex items-center gap-1.5 rounded bg-positive-soft px-1.5 py-0.5 text-[10px] font-medium text-positive">
                <Sparkles className="h-2.5 w-2.5" />
                Nuevo candidato
              </span>
            )}
          </div>
        </div>
        <ActionPicker
          existing={card.existing}
          value={card.action}
          onChange={onActionChange}
        />
      </header>

      {/* ---- Identity row ---- */}
      <FieldGrid>
        <Field label="Nombre completo" required>
          <Input
            value={card.parsed.full_name}
            onChange={(v) => onParsedChange({ full_name: v })}
            placeholder="Nombre y apellido"
          />
        </Field>
        <Field label="Email">
          <Input
            value={card.parsed.email ?? ""}
            onChange={(v) => onParsedChange({ email: v || null })}
            placeholder="nombre@empresa.com"
            type="email"
          />
        </Field>
        <Field label="Teléfono">
          <Input
            value={card.parsed.phone ?? ""}
            onChange={(v) => onParsedChange({ phone: v || null })}
            placeholder="+52 55 …"
          />
        </Field>
        <Field label="LinkedIn">
          <Input
            value={card.parsed.linkedin_url ?? ""}
            onChange={(v) => onParsedChange({ linkedin_url: v || null })}
            placeholder="https://www.linkedin.com/in/…"
          />
        </Field>
        <Field label="Ubicación">
          {mapsApiKey ? (
            <LocationAutocomplete
              apiKey={mapsApiKey}
              defaultValue={card.parsed.location ?? ""}
              defaultPlaceId={card.location_place_id ?? undefined}
              onChange={onLocationPick}
            />
          ) : (
            // Fall back to plain input when the public Maps key is
            // missing (e.g. local dev without .env.local set).
            <Input
              value={card.parsed.location ?? ""}
              onChange={(v) => onParsedChange({ location: v || null })}
              placeholder="Ciudad, país"
            />
          )}
        </Field>
        <Field label="Años de experiencia">
          <Input
            value={
              card.parsed.total_years_experience != null
                ? String(card.parsed.total_years_experience)
                : ""
            }
            onChange={(v) => {
              const parsed = v.trim() === "" ? null : parseInt(v, 10);
              onParsedChange({
                total_years_experience:
                  parsed != null && !isNaN(parsed) ? parsed : null,
              });
            }}
            placeholder="8"
            type="number"
          />
        </Field>
      </FieldGrid>

      {/* ---- Headline + current role ---- */}
      <FieldGrid>
        <Field label="Headline">
          <Input
            value={card.parsed.headline ?? ""}
            onChange={(v) => onParsedChange({ headline: v || null })}
            placeholder="Senior Software Engineer at …"
            wide
          />
        </Field>
        <Field label="Empresa actual">
          <Input
            value={card.parsed.current_company ?? ""}
            onChange={(v) => onParsedChange({ current_company: v || null })}
          />
        </Field>
        <Field label="Puesto actual">
          <Input
            value={card.parsed.current_position ?? ""}
            onChange={(v) => onParsedChange({ current_position: v || null })}
          />
        </Field>
      </FieldGrid>

      {/* ---- Summary ---- */}
      <Field label="Resumen">
        <TextArea
          value={card.parsed.summary ?? ""}
          onChange={(v) => onParsedChange({ summary: v || null })}
          rows={3}
          placeholder="Breve descripción profesional…"
        />
      </Field>

      {/* ---- Experience ---- */}
      {card.parsed.experience.length > 0 ? (
        <Subsection icon={<Briefcase className="h-3.5 w-3.5" />} label="Experiencia">
          <ul className="space-y-3">
            {card.parsed.experience.map((e, i) => (
              <li
                key={i}
                className="rounded border border-foreground/10 bg-background/40 p-2"
              >
                <FieldGrid compact>
                  <Field label="Empresa" required>
                    <Input
                      value={e.company}
                      onChange={(v) => onExperienceChange(i, { company: v })}
                    />
                  </Field>
                  <Field label="Puesto">
                    <Input
                      value={e.position ?? ""}
                      onChange={(v) =>
                        onExperienceChange(i, { position: v || null })
                      }
                    />
                  </Field>
                  <Field label="Inicio">
                    <Input
                      value={e.start_date ?? ""}
                      onChange={(v) =>
                        onExperienceChange(i, { start_date: v || null })
                      }
                      placeholder="YYYY-MM"
                    />
                  </Field>
                  <Field label="Fin">
                    <Input
                      value={e.end_date ?? ""}
                      onChange={(v) =>
                        onExperienceChange(i, { end_date: v || null })
                      }
                      placeholder="YYYY-MM o present"
                    />
                  </Field>
                </FieldGrid>
                {e.description ? (
                  <Field label="Descripción">
                    <TextArea
                      value={e.description}
                      onChange={(v) =>
                        onExperienceChange(i, { description: v || null })
                      }
                      rows={2}
                    />
                  </Field>
                ) : null}
              </li>
            ))}
          </ul>
        </Subsection>
      ) : null}

      {/* ---- Education ---- */}
      {card.parsed.education.length > 0 ? (
        <Subsection
          icon={<GraduationCap className="h-3.5 w-3.5" />}
          label="Educación"
        >
          <ul className="space-y-2">
            {card.parsed.education.map((e, i) => (
              <li
                key={i}
                className="rounded border border-foreground/10 bg-background/40 p-2"
              >
                <FieldGrid compact>
                  <Field label="Escuela" required>
                    <Input
                      value={e.school}
                      onChange={(v) => onEducationChange(i, { school: v })}
                    />
                  </Field>
                  <Field label="Grado">
                    <Input
                      value={e.degree ?? ""}
                      onChange={(v) =>
                        onEducationChange(i, { degree: v || null })
                      }
                    />
                  </Field>
                  <Field label="Campo">
                    <Input
                      value={e.field ?? ""}
                      onChange={(v) =>
                        onEducationChange(i, { field: v || null })
                      }
                    />
                  </Field>
                </FieldGrid>
              </li>
            ))}
          </ul>
        </Subsection>
      ) : null}

      {/* ---- Skills + languages ---- */}
      {card.parsed.skills.length > 0 ? (
        <Subsection icon={<Sparkles className="h-3.5 w-3.5" />} label="Skills">
          <ChipList
            values={card.parsed.skills}
            onChange={(v) => onParsedChange({ skills: v })}
          />
        </Subsection>
      ) : null}
      {card.parsed.languages.length > 0 ? (
        <Subsection icon={<Languages className="h-3.5 w-3.5" />} label="Idiomas">
          <ChipList
            values={card.parsed.languages}
            onChange={(v) => onParsedChange({ languages: v })}
          />
        </Subsection>
      ) : null}
    </article>
  );
}

// =========================================================
// Action picker (top-right of each card)
// =========================================================

function ActionPicker({
  existing,
  value,
  onChange,
}: {
  existing?: ExistingMatch;
  value: CardAction;
  onChange: (a: CardAction) => void;
}) {
  if (!existing) {
    // No duplicate → simple checkbox.
    const checked = value === "create";
    return (
      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? "create" : "skip")}
          className="h-3.5 w-3.5"
        />
        Crear
      </label>
    );
  }
  return (
    <Select
      value={value}
      onChange={(v) => onChange(v as CardAction)}
      className="w-44"
      options={[
        { value: "update", label: "Actualizar este" },
        { value: "create_new", label: "Crear nuevo" },
        { value: "skip", label: "Omitir" },
      ]}
    />
  );
}

// =========================================================
// Tiny field primitives (kept local — only used by this wizard)
// =========================================================

function FieldGrid({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2",
        compact ? "mb-1.5" : "mb-3",
      )}
    >
      {children}
    </dl>
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
    <div>
      <dt className="text-[11px] text-muted-foreground">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  wide,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-8 w-full rounded-md border border-border bg-background px-2 text-sm",
        wide && "sm:col-span-2",
      )}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
    />
  );
}

function Subsection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-3 group" open>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
        {icon}
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function ChipList({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            aria-label={`Quitar ${v}`}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
