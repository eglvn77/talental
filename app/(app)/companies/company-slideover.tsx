"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  type CompanyRow,
  type CompanyStatus,
  type CustomFieldDefinitionRow,
  type NoteRow,
  type JobRow,
  type JobStatusRow,
} from "@/lib/hiring";
import type {
  CompanyCandidate,
  CompanyEvent,
  CompanyNav,
  LinkedContact,
  LinkedDeal,
} from "../_actions/load-company-bundle";
import { cn } from "@/lib/utils";
import { formatSalaryRange } from "@/lib/format";
import { CompanyLogo } from "@/components/company-logo";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  enrichCompanyAction,
  removeCompanyLogoAction,
  updateCompanyAction,
  updateCompanyStatusAction,
  uploadCompanyLogoAction,
} from "../actions";
import { CompanyNotes } from "./company-notes";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";

const STATUSES: CompanyStatus[] = ["prospect", "client", "partner", "none"];

const STATUS_ES: Record<CompanyStatus, string> = {
  prospect: "Prospecto",
  client: "Cliente",
  partner: "Aliado",
  none: "Otra",
};

// Distillate token mapping for the per-status indicator bar under the
// company status select. Mirrors the <Pill> tones used in the table.
const STATUS_BAR_CLASS: Record<CompanyStatus, string> = {
  client: "bg-positive",
  prospect: "bg-warning",
  partner: "bg-accent",
  none: "bg-fg-muted",
};

export function CompanySlideover({
  company,
  roles,
  notes,
  customFieldDefinitions,
  customFieldValues,
  linkedContacts,
  linkedDeals,
  events,
  candidates,
  nav,
  onBundleStale,
  revalidatePath,
}: {
  company: CompanyRow;
  roles: Array<JobRow & { status: JobStatusRow | null }>;
  notes: NoteRow[];
  customFieldDefinitions: CustomFieldDefinitionRow[];
  customFieldValues: Record<string, unknown>;
  linkedContacts: LinkedContact[];
  linkedDeals: LinkedDeal[];
  events: CompanyEvent[];
  candidates: CompanyCandidate[];
  nav: CompanyNav;
  /** Re-fetch the bundle that feeds this slideover. Use after a
   *  side-effect (enrichment, etc) that mutates the company outside
   *  the per-field autosave path — router.refresh alone wouldn't
   *  retrigger the global host's client-side fetch. Optional so
   *  pages that render this directly (legacy /companies render)
   *  don't break. */
  onBundleStale?: () => void;
  revalidatePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Top-level tabs: "Overview" keeps the existing stack; "Candidatos"
  // surfaces the cross-vacante history so the recruiter can see every
  // person they've ever shown the client. Local state — the URL
  // already encodes which company is open, the tab is ephemeral.
  const [tab, setTab] = useState<"overview" | "candidates">("overview");

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("company");
    router.push(url.pathname + (url.search || ""), { scroll: false });
  }

  // Hop to another company while keeping the slideover open and the
  // rest of the URL state intact. The global host re-fetches on the
  // new id; the close button still strips the param to land cleanly.
  function navigateToCompany(nextCompanyId: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("company", nextCompanyId);
    setTab("overview");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [enriching, setEnriching] = useState(false);

  async function onEnrich() {
    setEnriching(true);
    const res = await enrichCompanyAction({ companyId: company.id });
    setEnriching(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo enriquecer", res.error);
      return;
    }
    // Three distinct outcomes — phrase each so the recruiter knows
    // whether to act, retry, or move on.
    if (res.data.notFound) {
      toast.actionOk(
        "Sin datos en DataForB2B",
        "Esta empresa no está en su índice. Llena los campos a mano.",
      );
    } else if (res.data.filled.length === 0) {
      toast.actionOk("Sin cambios", "Todos los campos ya estaban llenos.");
    } else {
      toast.actionOk(
        `Llenamos ${res.data.filled.length} ${res.data.filled.length === 1 ? "campo" : "campos"}`,
        res.data.labels.join(", "),
      );
    }
    // Re-fetch the slideover's bundle so the new column values
    // (industry, size, etc) surface immediately without a manual
    // browser refresh. Also kick router.refresh so the underlying
    // table re-derives counts/filters.
    onBundleStale?.();
    router.refresh();
  }

  async function onLogoFile(file: File | null) {
    if (!file) return;
    setUploadingLogo(true);
    const fd = new FormData();
    fd.append("company_id", company.id);
    fd.append("file", file);
    const res = await uploadCompanyLogoAction(fd);
    setUploadingLogo(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo subir el logo", res.error);
      return;
    }
    toast.actionOk("Logo actualizado");
    onBundleStale?.();
    router.refresh();
  }

  async function onRemoveLogo() {
    setUploadingLogo(true);
    const res = await removeCompanyLogoAction({ companyId: company.id });
    setUploadingLogo(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo quitar el logo", res.error);
      return;
    }
    toast.actionOk("Logo eliminado");
    onBundleStale?.();
    router.refresh();
  }

  function changeStatus(s: CompanyStatus) {
    startTransition(async () => {
      const res = await updateCompanyStatusAction(company.id, s);
      if (res.ok) {
        onBundleStale?.();
        router.refresh();
      }
    });
  }

  // Single entry point for every inline-edit save in this slideover.
  // Each <InlineField> calls this with the exact patch shape sans
  // companyId; on success we refresh so the row re-derives (name +
  // domain in the header, etc). Returns an error string for the
  // helper to surface; null = success.
  type CompanyPatch = Omit<
    Parameters<typeof updateCompanyAction>[0],
    "companyId"
  >;
  async function saveField(patch: CompanyPatch): Promise<string | null> {
    const res = await updateCompanyAction({ ...patch, companyId: company.id });
    if (!res.ok) return res.error;
    onBundleStale?.();
    router.refresh();
    return null;
  }

  return (
    <Dialog.Root open onOpenChange={(o) => (!o ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-modal",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="flex min-w-0 items-center gap-3 text-sm">
              {/* Click the logo to swap it. Hover surfaces the upload
                  affordance so the empty state is obvious without
                  shouting at the user when a logo is already set. */}
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                aria-label="Cambiar logo"
                className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-bg-1 transition-colors hover:border-accent/40"
              >
                <CompanyLogo
                  src={company.logo_url}
                  domain={company.domain}
                  name={company.name}
                  size="md"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/60 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploadingLogo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-bg-1" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5 text-bg-1" />
                  )}
                </span>
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onLogoFile(f);
                }}
              />
              <div className="min-w-0">
                <Dialog.Title className="truncate text-base font-semibold">
                  {company.name}
                </Dialog.Title>
                {company.domain ? (
                  <a
                    href={company.website_url ?? `https://${company.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {company.domain}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Pulls Industria, Tamaño, LinkedIn, Descripción, etc.
                  from DataForB2B and merges into the row — only fills
                  blanks, never overwrites manual edits. Visible only
                  when there's an identifier to look up against. */}
              {company.domain || company.linkedin_url ? (
                <button
                  type="button"
                  onClick={() => void onEnrich()}
                  disabled={enriching}
                  aria-label="Enriquecer con DataForB2B"
                  title="Llena campos vacíos desde DataForB2B"
                  className="mr-1 inline-flex items-center gap-1 rounded-md border border-border bg-bg-1 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-bg-2 hover:text-foreground disabled:opacity-60"
                >
                  {enriching ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Enriquecer
                </button>
              ) : null}
              {/* Prev/next pagination through the workspace's
                  alphabetically-sorted companies. Disabled at the
                  boundaries so the user never lands on a no-op. */}
              <button
                type="button"
                onClick={() =>
                  nav.prevCompanyId && navigateToCompany(nav.prevCompanyId)
                }
                disabled={!nav.prevCompanyId}
                aria-label="Empresa anterior"
                title="Empresa anterior"
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-muted-foreground">
                {nav.index} / {nav.total}
              </span>
              <button
                type="button"
                onClick={() =>
                  nav.nextCompanyId && navigateToCompany(nav.nextCompanyId)
                }
                disabled={!nav.nextCompanyId}
                aria-label="Empresa siguiente"
                title="Empresa siguiente"
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {company.logo_url ? (
                <button
                  type="button"
                  onClick={() => void onRemoveLogo()}
                  disabled={uploadingLogo}
                  aria-label="Quitar logo"
                  title="Quitar logo"
                  className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <Dialog.Close
                aria-label="Cerrar"
                className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </div>

          <Dialog.Description className="sr-only">
            Detalles de la empresa, vacantes vinculadas y notas
          </Dialog.Description>

          {/* Dense stats row borrowed from Leonar's company page — gives
              a one-glance read of the surface area of this account
              before the recruiter scrolls into any specific section. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/10 px-5 py-2 text-[11px] text-muted-foreground">
            <StatChip label="Vacantes" value={roles.length} />
            <StatChip label="Contactos" value={linkedContacts.length} />
            <StatChip label="Deals" value={linkedDeals.length} />
            <span className="ml-auto">
              Creada{" "}
              {new Date(company.created_at).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {" · "}
              Actualizada{" "}
              {new Date(company.updated_at).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          {/* Tabs row. Overview is the existing stack; Candidatos is
              the cross-vacante history. Tabs sit outside the main
              column so the aside (which doesn't depend on the tab)
              isn't re-rendered on switch. */}
          <div className="flex items-center gap-1 border-b border-border px-5">
            <TabButton
              active={tab === "overview"}
              onClick={() => setTab("overview")}
            >
              Overview
            </TabButton>
            <TabButton
              active={tab === "candidates"}
              onClick={() => setTab("candidates")}
              count={candidates.length}
            >
              Candidatos
            </TabButton>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              {tab === "candidates" ? (
                <CandidatesTabContent candidates={candidates} />
              ) : (
                <>
              <Section label="Descripción">
                <InlineField
                  initial={company.description ?? ""}
                  multiline
                  placeholder="¿A qué se dedican? Tono, sector, contexto útil para reclutar para ellos."
                  onSave={(value) => saveField({ description: value })}
                />
              </Section>

              <Section label={`Vacantes · ${roles.length}`}>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Esta empresa aún no tiene vacantes.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {roles.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/jobs/${r.id}`}
                          className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.title}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[
                                r.location,
                                formatSalaryRange(
                                  r.salary_min,
                                  r.salary_max,
                                  r.salary_currency,
                                  r.salary_type,
                                  r.salary_frequency,
                                ),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </div>
                          </div>
                          {r.status ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{
                                background:
                                  (r.status.color ?? "#94a3b8") + "22",
                                color: r.status.color ?? "#94a3b8",
                              }}
                            >
                              {r.status.label}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                label={`Contactos · ${linkedContacts.length}`}
                action={
                  // Send the user to /contacts with the create modal
                  // pre-opened and the company id pre-filled. Once the
                  // contact slideover gets globalized we can swap this
                  // for an inline add.
                  <Link
                    href={`/contacts?create=1&company=${company.id}`}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar
                  </Link>
                }
              >
                {linkedContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin contactos vinculados.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {linkedContacts.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/contacts?contact=${c.id}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {c.full_name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[c.title, c.email].filter(Boolean).join(" · ") ||
                                "—"}
                            </div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                label={`Deals · ${linkedDeals.length}`}
                action={
                  <Link
                    href={`/deals?create=1&company=${company.id}`}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar
                  </Link>
                }
              >
                {linkedDeals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin deals vinculados.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {linkedDeals.map((d) => (
                      <li key={d.id}>
                        <Link
                          href={`/deals?deal=${d.id}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {d.title}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[
                                DEAL_STAGE_LABEL[d.stage] ?? d.stage,
                                formatDealValue(d.value_amount, d.value_currency),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {customFieldDefinitions.length > 0 ? (
                <Section label="Campos personalizados">
                  <CustomFieldsBlock
                    entityId={company.id}
                    definitions={customFieldDefinitions}
                    initialValues={customFieldValues}
                  />
                </Section>
              ) : null}

              <Section label="Notas">
                <CompanyNotes
                  companyId={company.id}
                  notes={notes}
                  revalidatePath={revalidatePath}
                />
              </Section>

              {/* Audit trail. Lives at the bottom on purpose — the
                  recruiter only cares "who edited what" when something
                  looks off; the actionable sections deserve top space. */}
              <Section label={`Actividad · ${events.length}`}>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin actividad registrada.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {events.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">
                            {e.actor?.full_name ?? "Sistema"}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {e.summary}
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {formatEventDate(e.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
                </>
              )}
            </div>

            <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-muted/20 p-5 text-sm">
              <Field label="Nombre">
                <InlineField
                  initial={company.name}
                  placeholder="Nombre legal o comercial"
                  onSave={(value) => saveField({ name: value })}
                />
              </Field>
              <Field label="Sitio web">
                <InlineField
                  initial={company.website_url ?? ""}
                  type="url"
                  placeholder="https://empresa.com"
                  onSave={(value) => saveField({ websiteUrl: value })}
                />
                {company.domain ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Dominio: {company.domain}
                  </p>
                ) : null}
              </Field>
              <Field label="Estado">
                <Select
                  value={company.status}
                  onChange={(v) => changeStatus(v as CompanyStatus)}
                  disabled={isPending}
                  options={STATUSES.map((s) => ({
                    value: s,
                    label: STATUS_ES[s],
                  }))}
                />
                <span
                  className={`mt-1 inline-block h-1.5 w-full rounded ${STATUS_BAR_CLASS[company.status]}`}
                />
              </Field>
              <Field label="Industria">
                <InlineField
                  initial={company.industry ?? ""}
                  placeholder="p. ej. SaaS, Fintech, Manufactura"
                  onSave={(value) => saveField({ industry: value })}
                />
              </Field>
              <Field label="Tamaño">
                <InlineField
                  initial={company.size_range ?? ""}
                  placeholder="p. ej. 11-50, 200-500"
                  onSave={(value) => saveField({ sizeRange: value })}
                />
              </Field>
              <Field label="Sede">
                <InlineField
                  initial={company.hq_location ?? ""}
                  placeholder="Ciudad, país"
                  onSave={(value) => saveField({ hqLocation: value })}
                />
              </Field>
              <Field label="LinkedIn">
                <InlineField
                  initial={company.linkedin_url ?? ""}
                  type="url"
                  placeholder="https://linkedin.com/company/…"
                  onSave={(value) => saveField({ linkedinUrl: value })}
                />
                {company.linkedin_url ? (
                  <a
                    href={company.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Abrir perfil <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </Field>
              <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
                <div>
                  Creada {new Date(company.created_at).toLocaleDateString("es-MX")}
                </div>
                <div>
                  Actualizada {new Date(company.updated_at).toLocaleDateString("es-MX")}
                </div>
              </div>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  /** Optional right-aligned slot in the section header (e.g. a
   *  "+ Agregar" link). Keeps the section title row from needing a
   *  bespoke layout per call site. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-md border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-foreground">{label}</span>
      <span className="font-mono text-foreground tabular-nums">{value}</span>
    </span>
  );
}

const DEAL_STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  qualified: "Calificado",
  proposal: "Propuesta",
  negotiation: "Negociación",
  won: "Ganado",
  lost: "Perdido",
};

function formatDealValue(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency ?? "MXN",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {typeof count === "number" ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
            {count}
          </span>
        ) : null}
      </span>
      {active ? (
        <span className="absolute inset-x-2 -bottom-px h-0.5 bg-accent" />
      ) : null}
    </button>
  );
}

function CandidatesTabContent({
  candidates,
}: {
  candidates: CompanyCandidate[];
}) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay candidatos vinculados a vacantes de esta empresa.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-max text-sm">
        <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Candidato</th>
            <th className="px-3 py-2 text-left font-medium">Vacante</th>
            <th className="px-3 py-2 text-left font-medium">Etapa</th>
            <th className="px-3 py-2 text-left font-medium">Última actividad</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr
              key={c.applicationId}
              className="border-b border-border last:border-b-0 hover:bg-muted/40"
            >
              <td className="px-3 py-2">
                <Link
                  href={`?candidate=${c.candidateId}`}
                  scroll={false}
                  className="font-medium hover:underline"
                >
                  {c.fullName}
                </Link>
                {c.email ? (
                  <div className="text-xs text-muted-foreground">
                    {c.email}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/jobs/${c.job.id}?contact=${c.applicationId}`}
                  className="text-xs text-foreground hover:underline"
                >
                  {c.job.title}
                </Link>
              </td>
              <td className="px-3 py-2">
                {c.stage ? (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: c.stage.color ?? "#94a3b8" }}
                    />
                    <span className="truncate">{c.stage.name}</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {new Date(c.statusChangedAt).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/**
 * Inline-editing primitive used across the slideover. Behaviour
 * matches the Procesos editor: local state, commit on blur or Enter,
 * Escape reverts, tiny spinner / check next to the label while the
 * server roundtrip resolves. The parent `onSave` returns null for
 * success or an error string we surface as a toast + roll back to
 * the last-saved value.
 */
function InlineField({
  initial,
  placeholder,
  multiline = false,
  type = "text",
  onSave,
}: {
  initial: string;
  placeholder?: string;
  multiline?: boolean;
  type?: "text" | "url";
  onSave: (value: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(initial);
  const lastSaved = useRef(initial);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Resync when the prop changes (post-revalidate after a save from
  // this field or any other). Skip while we're mid-edit — clobbering
  // the local buffer would be jarring.
  useEffect(() => {
    if (saving) return;
    setValue(initial);
    lastSaved.current = initial;
  }, [initial, saving]);

  async function commit() {
    const next = value.trim();
    if (next === (lastSaved.current ?? "").trim()) return;
    setSaving(true);
    const err = await onSave(next);
    setSaving(false);
    if (err) {
      toast.actionFailed("No se pudo guardar", err);
      setValue(lastSaved.current);
      return;
    }
    lastSaved.current = next;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 900);
  }

  const indicator = saving ? (
    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  ) : savedFlash ? (
    <Check className="h-3 w-3 text-positive" />
  ) : null;

  if (multiline) {
    return (
      <div className="space-y-1">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit()}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        />
        {indicator ? (
          <div className="flex justify-end">{indicator}</div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setValue(lastSaved.current);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
      {indicator ? (
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          {indicator}
        </span>
      ) : null}
    </div>
  );
}
