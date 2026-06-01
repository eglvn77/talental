"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createJobAction } from "../../actions";
import { CompanyCombobox } from "./company-combobox";
import { LocationAutocomplete } from "./location-autocomplete";
import { useT } from "@/lib/i18n/client";

/**
 * The list of templates a workspace exposes to the "Proceso"
 * selector. Loaded server-side and passed in by page.tsx.
 */
export type ProcessTemplateOption = {
  id: string;
  name: string;
  is_default: boolean;
};

/**
 * Open-vacante flow — slim version.
 *
 * Captures the bare minimum to start a pipeline: title, company,
 * ubicación, and which process template's stages get seeded. Fee
 * terms moved to a dedicated admin-only tab inside the vacante
 * (`/jobs/[jobId]/terms`); they're no longer collected here.
 *
 * The vacante still nace en Borrador — JD, requisitos, sourcing
 * questions, etc. land via Kickoff after opening.
 */
export function NewJobForm({
  templates,
  onBack,
}: {
  templates: ProcessTemplateOption[];
  /** When set, shows a "← change mode" link back to the create chooser. */
  onBack?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultTemplate =
    templates.find((tpl) => tpl.is_default) ?? templates[0] ?? null;
  const [templateId, setTemplateId] = useState<string | null>(
    defaultTemplate?.id ?? null,
  );

  const [companyId, setCompanyId] = useState<string>("");

  // After a successful create, we don't redirect immediately — we
  // pivot the modal to a "¿Qué sigue?" chooser. Setting this also
  // hides the form so the user can't double-submit.
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [createdTitle, setCreatedTitle] = useState<string>("");

  // Location state mirrors the autocomplete payload — we only let
  // through values that carried a Google place_id (the action rejects
  // free-text locations).
  const [location, setLocation] = useState<{
    location: string;
    placeId: string;
    lat: string;
    lng: string;
  } | null>(null);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();

    if (!title) {
      setError(t("jobsList.titleRequired"));
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await createJobAction({
        companyId: companyId || null,
        title,
        location: location?.location || undefined,
        locationLat: location?.lat ? Number(location.lat) : undefined,
        locationLng: location?.lng ? Number(location.lng) : undefined,
        locationPlaceId: location?.placeId || undefined,
        processTemplateId: templateId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.actionOk(t("jobsList.toastCreated"));
      // Don't navigate yet — show the chooser so the recruiter can
      // jump straight into kickoff with the materials still fresh in
      // their head. "Después" is the fallback that just lands on the
      // vacante page in Borrador.
      setCreatedJobId(res.data.jobId);
      setCreatedTitle(title);
    });
  }

  // Post-create chooser — replaces the form once we have a jobId.
  if (createdJobId) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-md border border-positive-soft bg-positive-soft/40 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {createdTitle
                ? t("jobsList.createdNamed", { title: createdTitle })
                : t("jobsList.createdUnnamed")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("jobsList.kickoffPrompt")}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {/* Primary path: Kickoff. Lands on the vacante with the
              kickoff dialog auto-opened via ?kickoff=1. */}
          <Button
            type="button"
            variant="ghost"
            className="btn-ai h-auto flex-col items-start gap-1 px-4 py-3 text-left"
            onClick={() => {
              router.push(`/jobs/${createdJobId}?kickoff=1`);
            }}
          >
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              {t("jobsList.kickoffNow")}
            </span>
            <span className="text-[11px] opacity-90">
              {t("jobsList.kickoffNowDesc")}
            </span>
          </Button>

          {/* Escape hatch: leave the vacante in Borrador and continue
              later. Just navigates to the vacante page. */}
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 px-4 py-3 text-left"
            onClick={() => {
              router.push(`/jobs/${createdJobId}`);
            }}
          >
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <ArrowRight className="h-3.5 w-3.5" />
              {t("jobsList.kickoffLater")}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t("jobsList.kickoffLaterDesc")}
            </span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t("jobsList.chooserBack")}
        </button>
      ) : null}

      <Field label={t("jobsList.fieldTitle")} required>
        <Input
          name="title"
          required
          autoFocus
          placeholder={t("jobsList.fieldTitlePlaceholder")}
        />
      </Field>

      <Field label={t("jobsList.fieldCompany")}>
        <CompanyCombobox
          defaultCompany={null}
          onChange={(c) => setCompanyId(c?.id ?? "")}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("jobsList.fieldCompanyHelp")}
        </p>
      </Field>

      <Field label={t("jobsList.fieldLocation")}>
        <LocationAutocomplete
          apiKey={mapsApiKey}
          onChange={(loc) => setLocation(loc)}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("jobsList.fieldLocationHelp")}
        </p>
      </Field>

      <Field label={t("jobsList.fieldProcess")} required>
        {templates.length === 0 ? (
          <div className="rounded-md border border-border bg-bg-3 px-3 py-2 text-xs text-muted-foreground">
            {t("jobsList.noTemplates")}
          </div>
        ) : (
          <Select
            value={templateId ?? ""}
            onChange={(v) => setTemplateId(v || null)}
            searchable={templates.length > 8}
            options={templates.map((tpl) => ({
              value: tpl.id,
              label: tpl.is_default
                ? t("jobsList.templateDefault", { name: tpl.name })
                : tpl.name,
            }))}
          />
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("jobsList.fieldProcessHelp")}
        </p>
      </Field>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-danger-soft bg-danger-soft/40 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending ? t("jobsList.creating") : t("jobsList.createJob")}
        </Button>
      </div>
    </form>
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
    <label className="block">
      <span className="text-xs font-medium text-fg-2">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
