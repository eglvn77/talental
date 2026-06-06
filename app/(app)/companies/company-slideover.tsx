"use client";

import { startTransition, useEffect, useRef, useState, useTransition } from "react";
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
  type SourceRow,
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
import { type CompanyStatusDisplay } from "@/lib/company-status";
import { CompanyLogo } from "@/components/company-logo";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  clearCompanyEnrichmentAction,
  enrichCompanyByDomainAction,
  removeCompanyLogoAction,
  updateCompanyAction,
  updateCompanyStatusAction,
  uploadCompanyLogoAction,
} from "../actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CompanyNotes } from "./company-notes";
import { CompanyPortalTab } from "./_components/company-portal-tab";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";

/** Client-side safe key→display lookup (the server helper in
 *  lib/company-status can't be imported into this client component). */
function displayFor(
  map: Record<string, CompanyStatusDisplay>,
  key: string,
): CompanyStatusDisplay {
  return map[key] ?? { label: key, color: "#94a3b8" };
}

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
  statusConfig: statusConfigProp,
  statusOrder: statusOrderProp,
  sources = [],
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
  /** Per-workspace company-status display (key → label + color).
   *  Optional for back-compat; falls back to empty when not provided. */
  statusConfig?: Record<string, CompanyStatusDisplay>;
  /** Status keys in admin-defined order, for the Estado dropdown. */
  statusOrder?: string[];
  /** Company-scope Source/Origen options for the inline dropdown. */
  sources?: SourceRow[];
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
  const t = useT();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Maps each status key → {label, color}. Empty fallback keeps a
  // legacy direct render from crashing (displayFor degrades safely).
  const statusConfig = statusConfigProp ?? {};
  const statusOrder = statusOrderProp ?? Object.keys(statusConfig);

  // Top-level tabs: "Overview" keeps the existing stack; "Candidatos"
  // surfaces the cross-vacante history so the recruiter can see every
  // person they've ever shown the client. Local state — the URL
  // already encodes which company is open, the tab is ephemeral.
  const [tab, setTab] = useState<"overview" | "candidates" | "portal">(
    "overview",
  );

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("company");
    // startTransition: let the dialog's close animation run at 60fps
    // while the RSC tree revalidates in the background.
    startTransition(() =>
      router.push(url.pathname + (url.search || ""), { scroll: false }),
    );
  }

  // Hop to another company while keeping the slideover open and the
  // rest of the URL state intact. The global host re-fetches on the
  // new id; the close button still strips the param to land cleanly.
  function navigateToCompany(nextCompanyId: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("company", nextCompanyId);
    setTab("overview");
    // Same reasoning as close(): keep the swap feeling instant.
    startTransition(() =>
      router.push(`${pathname}?${params.toString()}`, { scroll: false }),
    );
  }

  // ← / → keyboard nav through the prev/next companies the bundle
  // resolved. Ignored when focus is in an editable field (notes,
  // inline inspector) so typing doesn't hijack the arrows. Esc is
  // already handled by Radix Dialog (closes via onOpenChange).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && nav.prevCompanyId) {
        e.preventDefault();
        navigateToCompany(nav.prevCompanyId);
      } else if (e.key === "ArrowRight" && nav.nextCompanyId) {
        e.preventDefault();
        navigateToCompany(nav.nextCompanyId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // navigateToCompany is stable for the lifetime of this slideover
    // instance (recreated on company change via the host); reading
    // the latest prev/next ids keeps the deps small + correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.prevCompanyId, nav.nextCompanyId]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  async function onClearEnrichment() {
    const res = await clearCompanyEnrichmentAction({ companyId: company.id });
    if (!res.ok) {
      toast.actionFailed(t("companiesArea.clearFailed"), res.error);
      return;
    }
    setClearConfirm(false);
    toast.actionOk(t("companiesArea.enrichmentCleared"));
    onBundleStale?.();
    router.refresh();
  }

  async function onEnrich() {
    setEnriching(true);
    // Domain-based enrichment (/search/companies) — the path that
    // works for companies (most have a domain; few have a LinkedIn
    // identifier). Explicit click forces a fresh run server-side.
    const res = await enrichCompanyByDomainAction({ companyId: company.id });
    setEnriching(false);
    if (!res.ok) {
      toast.actionFailed(t("companiesArea.enrichFailed"), res.error);
      return;
    }
    // Phrase each outcome so the recruiter knows the next move.
    switch (res.data.status) {
      case "enriched":
        toast.actionOk(
          t("companiesArea.enrichedTitle"),
          t("companiesArea.enrichedDesc", {
            confidence: Math.round((res.data.matchConfidence ?? 0) * 100),
            credits: res.data.creditsUsed.toFixed(2),
          }),
        );
        break;
      case "low_confidence":
        toast.actionOk(
          t("companiesArea.lowConfidenceTitle"),
          t("companiesArea.lowConfidenceDesc", {
            count: res.data.alternativesCount,
          }),
        );
        break;
      case "no_match":
        toast.actionOk(
          t("companiesArea.noMatchTitle"),
          t("companiesArea.noMatchDesc"),
        );
        break;
      case "skipped":
        toast.actionOk(
          t("companiesArea.skippedTitle"),
          t("companiesArea.skippedDesc"),
        );
        break;
      case "invalid_domain":
        toast.actionFailed(
          t("companiesArea.invalidDomainTitle"),
          t("companiesArea.invalidDomainDesc"),
        );
        break;
      default:
        toast.actionFailed(t("companiesArea.resolveFailed"));
    }
    // Re-fetch the slideover bundle + refresh the table.
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
      toast.actionFailed(t("companiesArea.logoUploadFailed"), res.error);
      return;
    }
    toast.actionOk(t("companiesArea.logoUpdated"));
    onBundleStale?.();
    router.refresh();
  }

  async function onRemoveLogo() {
    setUploadingLogo(true);
    const res = await removeCompanyLogoAction({ companyId: company.id });
    setUploadingLogo(false);
    if (!res.ok) {
      toast.actionFailed(t("companiesArea.logoRemoveFailed"), res.error);
      return;
    }
    toast.actionOk(t("companiesArea.logoRemoved"));
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

  function changeSource(sourceId: string) {
    startTransition(async () => {
      const res = await updateCompanyAction({
        companyId: company.id,
        sourceId: sourceId || null,
      });
      if (res.ok) {
        onBundleStale?.();
        router.refresh();
      } else {
        toast.saveFailed(res.error);
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
                aria-label={t("companiesArea.changeLogo")}
                className="group relative shrink-0 overflow-hidden rounded-md transition-colors hover:border-accent/40"
              >
                <CompanyLogo
                  src={company.logo_url}
                  domain={company.domain}
                  name={company.name}
                  size="xl"
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
              {/* Domain-based enrichment via Coresignal Clean Company
                  (search by website → collect by id). Materializes
                  industry, size, funding, HQ, description, logo, etc.
                  Visible only when the company has a domain. Styled
                  to match the candidate header's Enrich button (same
                  .btn-ai gradient, same square h-8 footprint). */}
              {company.domain ? (
                <button
                  type="button"
                  onClick={() => void onEnrich()}
                  disabled={enriching}
                  aria-label={t("companiesArea.enrichAria")}
                  title={t("companiesArea.enrichTitle")}
                  className="btn-ai mr-1 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:opacity-50"
                >
                  {enriching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {t("companiesArea.enrich")}
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
                aria-label={t("companiesArea.prevCompany")}
                title={t("companiesArea.prevCompany")}
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
                aria-label={t("companiesArea.nextCompany")}
                title={t("companiesArea.nextCompany")}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {company.logo_url ? (
                <button
                  type="button"
                  onClick={() => void onRemoveLogo()}
                  disabled={uploadingLogo}
                  aria-label={t("companiesArea.removeLogo")}
                  title={t("companiesArea.removeLogo")}
                  className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <Dialog.Close
                aria-label={t("companiesArea.close")}
                className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </div>

          <Dialog.Description className="sr-only">
            {t("companiesArea.dialogDescription")}
          </Dialog.Description>

          {/* Dense stats row borrowed from Leonar's company page — gives
              a one-glance read of the surface area of this account
              before the recruiter scrolls into any specific section. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/10 px-5 py-2 text-[11px] text-muted-foreground">
            <StatChip label={t("companiesArea.statVacancies")} value={roles.length} />
            <StatChip label={t("companiesArea.statContacts")} value={linkedContacts.length} />
            <StatChip label={t("companiesArea.statDeals")} value={linkedDeals.length} />
            <span className="ml-auto">
              {t("companiesArea.createdLabel")}{" "}
              {new Date(company.created_at).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {" · "}
              {t("companiesArea.updatedLabel")}{" "}
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
              {t("companiesArea.tabOverview")}
            </TabButton>
            <TabButton
              active={tab === "candidates"}
              onClick={() => setTab("candidates")}
              count={candidates.length}
            >
              {t("companiesArea.tabCandidates")}
            </TabButton>
            <TabButton
              active={tab === "portal"}
              onClick={() => setTab("portal")}
            >
              {t("portal.tabLabel")}
            </TabButton>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              {tab === "candidates" ? (
                <CandidatesTabContent candidates={candidates} t={t} />
              ) : tab === "portal" ? (
                <CompanyPortalTab companyId={company.id} />
              ) : (
                <>
              <Section label={t("companiesArea.sectionDescription")}>
                <InlineField
                  initial={company.description ?? ""}
                  multiline
                  placeholder={t("companiesArea.descriptionPlaceholder")}
                  onSave={(value) => saveField({ description: value })}
                  t={t}
                />
              </Section>

              <Section label={t("companiesArea.sectionVacancies", { count: roles.length })}>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("companiesArea.noVacancies")}
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
                label={t("companiesArea.sectionContacts", { count: linkedContacts.length })}
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
                    {t("companiesArea.add")}
                  </Link>
                }
              >
                {linkedContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("companiesArea.noContacts")}
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
                label={t("companiesArea.sectionDeals", { count: linkedDeals.length })}
                action={
                  <Link
                    href={`/deals?create=1&company=${company.id}`}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    {t("companiesArea.add")}
                  </Link>
                }
              >
                {linkedDeals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("companiesArea.noDeals")}
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
                                dealStageLabel(t, d.stage),
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
                <Section label={t("companiesArea.sectionCustomFields")}>
                  <CustomFieldsBlock
                    entityId={company.id}
                    definitions={customFieldDefinitions}
                    initialValues={customFieldValues}
                  />
                </Section>
              ) : null}

              <Section label={t("companiesArea.sectionNotes")}>
                <CompanyNotes
                  companyId={company.id}
                  notes={notes}
                  revalidatePath={revalidatePath}
                />
              </Section>

              {/* Audit trail. Lives at the bottom on purpose — the
                  recruiter only cares "who edited what" when something
                  looks off; the actionable sections deserve top space. */}
              <Section label={t("companiesArea.sectionActivity", { count: events.length })}>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("companiesArea.noActivity")}
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
                            {e.actor?.full_name ?? t("companiesArea.systemActor")}
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
              <Field label={t("companiesArea.fieldName")}>
                <InlineField
                  initial={company.name}
                  placeholder={t("companiesArea.namePlaceholder")}
                  onSave={(value) => saveField({ name: value })}
                  t={t}
                />
              </Field>
              <Field label={t("companiesArea.fieldWebsite")}>
                <InlineField
                  initial={company.website_url ?? ""}
                  type="url"
                  placeholder="https://empresa.com"
                  onSave={(value) => saveField({ websiteUrl: value })}
                  t={t}
                />
                {company.domain ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {t("companiesArea.domainLabel")}: {company.domain}
                  </p>
                ) : null}
              </Field>
              <Field label={t("companiesArea.fieldStatus")}>
                <Select
                  value={company.status}
                  onChange={(v) => changeStatus(v as CompanyStatus)}
                  disabled={isPending}
                  options={statusOrder.map((s) => ({
                    value: s,
                    label: displayFor(statusConfig, s).label,
                  }))}
                />
                <span
                  className="mt-1 inline-block h-1.5 w-full rounded"
                  style={{ background: displayFor(statusConfig, company.status).color }}
                />
              </Field>
              {sources.length > 0 ? (
                <Field label={t("sourcesCfg.fieldLabel")}>
                  <Select
                    value={company.source_id ?? ""}
                    onChange={changeSource}
                    disabled={isPending}
                    options={[
                      { value: "", label: t("sourcesCfg.none") },
                      ...sources.map((s) => ({ value: s.id, label: s.label })),
                    ]}
                  />
                </Field>
              ) : null}
              <Field label={t("companiesArea.fieldIndustry")}>
                <InlineField
                  initial={company.industry ?? ""}
                  placeholder={t("companiesArea.industryPlaceholder")}
                  onSave={(value) => saveField({ industry: value })}
                  t={t}
                />
              </Field>
              <Field label={t("companiesArea.fieldSize")}>
                <InlineField
                  initial={company.size_range ?? ""}
                  placeholder={t("companiesArea.sizePlaceholder")}
                  onSave={(value) => saveField({ sizeRange: value })}
                  t={t}
                />
              </Field>
              <Field label={t("companiesArea.fieldHq")}>
                <InlineField
                  initial={company.hq_location ?? ""}
                  placeholder={t("companiesArea.hqPlaceholder")}
                  onSave={(value) => saveField({ hqLocation: value })}
                  t={t}
                />
              </Field>
              <Field label={t("companiesArea.fieldLinkedin")}>
                <InlineField
                  initial={company.linkedin_url ?? ""}
                  type="url"
                  placeholder="https://linkedin.com/company/…"
                  onSave={(value) => saveField({ linkedinUrl: value })}
                  t={t}
                />
                {company.linkedin_url ? (
                  <a
                    href={company.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {t("companiesArea.openProfile")} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </Field>
              <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
                <div>
                  {t("companiesArea.createdLabel")} {new Date(company.created_at).toLocaleDateString("es-MX")}
                </div>
                <div>
                  {t("companiesArea.updatedLabel")} {new Date(company.updated_at).toLocaleDateString("es-MX")}
                </div>
              </div>

              {/* Danger zone — wipe a bad enrichment (e.g. DfB2B matched
                  the wrong company). Type-to-confirm since it nulls the
                  firmographics + identity fields. */}
              <div className="mt-4 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setClearConfirm(true)}
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("companiesArea.clearEnrichment")}
                </button>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("companiesArea.clearEnrichmentHint")}
                </p>
              </div>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <ConfirmDialog
        open={clearConfirm}
        onOpenChange={setClearConfirm}
        title={t("companiesArea.clearConfirmTitle", { name: company.name })}
        description={t("companiesArea.clearConfirmDescription")}
        confirmLabel={t("companiesArea.clearConfirmLabel")}
        destructive
        requireConfirmationText={company.name}
        onConfirm={() => onClearEnrichment()}
      />
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

/** Localized label for a deal pipeline stage; falls back to the raw
 *  stage key for unknown values. */
function dealStageLabel(t: TFunction, stage: string): string {
  const KEYS: Record<string, string> = {
    lead: "companiesArea.dealStageLead",
    qualified: "companiesArea.dealStageQualified",
    proposal: "companiesArea.dealStageProposal",
    negotiation: "companiesArea.dealStageNegotiation",
    won: "companiesArea.dealStageWon",
    lost: "companiesArea.dealStageLost",
  };
  const key = KEYS[stage];
  return key ? t(key) : stage;
}

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
  t,
}: {
  candidates: CompanyCandidate[];
  t: TFunction;
}) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("companiesArea.noCandidates")}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-max text-sm">
        <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t("companiesArea.candCol")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("companiesArea.vacancyCol")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("companiesArea.stageCol")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("companiesArea.lastActivityCol")}</th>
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
  t,
}: {
  initial: string;
  placeholder?: string;
  multiline?: boolean;
  type?: "text" | "url";
  onSave: (value: string) => Promise<string | null>;
  t: TFunction;
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
      toast.actionFailed(t("companiesArea.saveFailed"), err);
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
