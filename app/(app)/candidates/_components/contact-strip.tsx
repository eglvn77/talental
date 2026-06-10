"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  Compass,
  Copy,
  Linkedin,
  Mail,
  MapPin,
  Pencil,
  Phone,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { LocationAutocomplete } from "@/app/(app)/jobs/new/location-autocomplete";
import { updateCandidateContactAction } from "@/app/(app)/_actions/candidate-profile";
import { useT } from "@/lib/i18n/client";
import type { SourceRow } from "@/lib/hiring";

type Patch = Parameters<typeof updateCandidateContactAction>[0]["patch"];

/**
 * Horizontal contact strip at the top of the candidate details tab.
 * THE single home for contact essentials — replaces both the old
 * header chips and the contact rows of the inspector (which caused
 * the "email/WhatsApp duplicated" complaint).
 *
 * Read mode: compact chips — email copies on click, phone is tel: +
 * WhatsApp deep link, LinkedIn opens the profile, location + source
 * are context.
 *
 * Edit: the pencil opens a dialog with every field editable
 * (incl. secondary email/phone). Fields autosave on blur via
 * updateCandidateContactAction; closing refreshes the page data.
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
  const [editOpen, setEditOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();

  const sourceLabel = sources.find((s) => s.id === sourceId)?.label ?? null;
  const waDigits = phone ? phone.replace(/\D/g, "") : "";

  function persist(patch: Patch) {
    start(async () => {
      const res = await updateCandidateContactAction({ candidateId, patch });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {/* Email — click to copy. */}
      {email ? (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(email)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => {});
          }}
          title="Copiar correo"
          className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Mail className="h-3.5 w-3.5" />
          <span className="max-w-[240px] truncate">{email}</span>
          {copied ? (
            <Check className="h-3 w-3 text-positive" />
          ) : (
            <Copy className="h-3 w-3 opacity-50" />
          )}
        </button>
      ) : null}

      {/* Phone — tel: + WhatsApp. */}
      {phone ? (
        <span className="inline-flex items-center gap-1.5">
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 font-mono transition-colors hover:bg-muted hover:text-foreground"
          >
            <Phone className="h-3.5 w-3.5" />
            {phone}
          </a>
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp"
              aria-label="WhatsApp"
              className="inline-flex items-center rounded p-0.5 text-muted-foreground transition-colors hover:text-[#25D366]"
            >
              <WhatsAppIcon />
            </a>
          ) : null}
        </span>
      ) : null}

      {/* LinkedIn — opens profile. */}
      {linkedinUrl ? (
        <a
          href={linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={linkedinUrl}
          className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Linkedin className="h-3.5 w-3.5" />
          LinkedIn
        </a>
      ) : null}

      {/* Location. */}
      {location ? (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          <span className="max-w-[200px] truncate">{location}</span>
        </span>
      ) : null}

      {/* Source. */}
      {sourceLabel ? (
        <span className="inline-flex items-center gap-1.5">
          <Compass className="h-3.5 w-3.5" />
          {sourceLabel}
        </span>
      ) : null}

      {/* Edit — opens the full contact editor. */}
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        title={t("common.edit")}
        aria-label={t("common.edit")}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-3 w-3" />
        {t("common.edit")}
      </button>

      <Dialog.Root
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          // Pull fresh values into the chips when the editor closes.
          if (!o) router.refresh();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-5 shadow-modal">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-sm font-semibold">
                {t("candidatesArea.contactSection")}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Cerrar"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="space-y-3">
              <Field label={t("candidatesArea.contactEmail")}>
                <BlurInput
                  type="email"
                  initial={email}
                  placeholder={t("candidatesArea.contactEmailPlaceholder")}
                  onSave={(v) => persist({ email: v })}
                />
              </Field>
              <Field label={`${t("candidatesArea.contactEmail")} 2`}>
                <BlurInput
                  type="email"
                  initial={emailSecondary}
                  placeholder={t("candidatesArea.contactEmailPlaceholder")}
                  onSave={(v) => persist({ email_secondary: v })}
                />
              </Field>
              <Field label={t("candidatesArea.contactPhone")}>
                <BlurInput
                  type="tel"
                  mono
                  initial={phone}
                  placeholder="+525512345678"
                  onSave={(v) => persist({ phone: v })}
                />
              </Field>
              <Field label={`${t("candidatesArea.contactPhone")} 2`}>
                <BlurInput
                  type="tel"
                  mono
                  initial={phoneSecondary}
                  placeholder="+525512345678"
                  onSave={(v) => persist({ phone_secondary: v })}
                />
              </Field>
              <Field label="LinkedIn">
                <BlurInput
                  type="url"
                  initial={linkedinUrl}
                  placeholder="https://www.linkedin.com/in/…"
                  onSave={(v) => persist({ linkedin_url: v })}
                />
              </Field>
              <Field label={t("candidatesArea.contactLocation")}>
                {mapsApiKey ? (
                  <LocationAutocomplete
                    apiKey={mapsApiKey}
                    defaultValue={location ?? ""}
                    defaultPlaceId={locationPlaceId ?? undefined}
                    onChange={(loc) =>
                      persist({
                        location: loc.location || null,
                        location_place_id: loc.placeId || null,
                        location_lat:
                          loc.lat && loc.lat !== "" ? parseFloat(loc.lat) : null,
                        location_lng:
                          loc.lng && loc.lng !== "" ? parseFloat(loc.lng) : null,
                      })
                    }
                  />
                ) : (
                  <BlurInput
                    type="text"
                    initial={location}
                    onSave={(v) => persist({ location: v })}
                  />
                )}
              </Field>
              {sources.length > 0 ? (
                <Field label={t("sourcesCfg.fieldLabel")}>
                  <Select
                    value={sourceId ?? ""}
                    onChange={(v) => persist({ source_id: v || null })}
                    options={[
                      { value: "", label: t("sourcesCfg.none") },
                      ...sources.map((s) => ({ value: s.id, label: s.label })),
                    ]}
                  />
                </Field>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end">
              <Dialog.Close className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
                {t("candidatesArea.done")}
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function BlurInput({
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
      className={
        "h-8 w-full rounded-md border border-border bg-background px-2 text-sm" +
        (mono ? " font-mono" : "")
      }
    />
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.42 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
    </svg>
  );
}
