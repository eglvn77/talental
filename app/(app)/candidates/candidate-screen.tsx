"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Sparkles,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { getResumeSignedUrlAction, deleteCandidateAction } from "../actions";
import { enrichFromLinkedinAction } from "../_actions/linkedin-enrich";
import { syncGranolaNowAction } from "../_actions/granola-sync";
// AddToJobDialog now lives inside CandidateDetalles (Applications card).
import { ConvertToContactDialog } from "./_components/convert-to-contact-dialog";
import { InlineNameEdit } from "./_components/inline-name-edit";

/** sessionStorage key holding the ordered candidate-id list + origin so
 *  the profile can offer prev/next through the originating view. */
export const CANDIDATE_NAV_KEY = "talental:candidateNav";

export type CandidateNavContext = {
  ids: string[];
  /** Where the "back" link returns to (e.g. /candidates or a job board). */
  origin?: string;
  /** Human label for the back link (e.g. job title). */
  originLabel?: string;
};

export type CandidateTab = "details" | "activity" | "conversations";

/**
 * Sticky header / chrome for the candidate profile. Tabs are URL-driven
 * (`?tab=`) so each panel renders directly in the server page — passing
 * server-rendered panels (which contain <img onError> company logos)
 * as props into a client component would break RSC serialization.
 *
 * This component owns only the interactive chrome: prev/next nav (reads
 * the id-list the originating view stashed in sessionStorage; ← → and
 * J/K shortcuts), Add-to-job, Send-message, and the overflow menu.
 */
export function CandidateHeader({
  candidateId,
  fullName,
  headline,
  currentTitle,
  currentCompany,
  profilePictureUrl,
  activeStage,
  hasResume,
  linkedinUrl = null,
  currentTab,
  linkedContactId = null,
  mode = "page",
  email = null,
  phone = null,
  location = null,
}: {
  candidateId: string;
  fullName: string;
  headline: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  profilePictureUrl: string | null;
  activeStage: { name: string; color: string | null } | null;
  hasResume: boolean;
  /** Candidate's LinkedIn URL — drives the AI-enrich button visibility. */
  linkedinUrl?: string | null;
  currentTab: CandidateTab;
  /** If the candidate was promoted from a contact, the archived
   *  contact id so the UI can link back to deal history. */
  linkedContactId?: string | null;
  /** "panel" = query-param nav over the talent-pool table (route never
   *  changes); "page" = standalone /candidates/[id] route. */
  mode?: "page" | "panel";
  /** Contact essentials rendered as compact chips under the name —
   *  email copies on click, phone pairs with a WhatsApp shortcut.
   *  The full editable inspector lives in the Detalles accordion. */
  email?: string | null;
  phone?: string | null;
  location?: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [nav, setNav] = useState<CandidateNavContext | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  // Build a URL on the CURRENT route, overriding only the panel params
  // (candidate / tab / app) and preserving everything else (e.g. a
  // job board's ?view=). This is what makes the panel route-agnostic:
  // it overlays whatever page opened it and closes back to it.
  const buildUrl = useCallback(
    (overrides: { candidate?: string | null; tab?: string | null; app?: string | null }) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null) sp.delete(key);
        else if (value !== undefined) sp.set(key, value);
      }
      const qs = sp.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  // Read the nav context the originating view stashed on row click.
  // Absent (direct link / shared URL) → prev/next stays hidden.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CANDIDATE_NAV_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CandidateNavContext;
      if (Array.isArray(parsed.ids) && parsed.ids.length > 0) setNav(parsed);
    } catch {
      /* ignore malformed nav context */
    }
  }, []);

  const index = nav ? nav.ids.indexOf(candidateId) : -1;
  const hasNav = nav !== null && index !== -1 && nav.ids.length > 1;
  const prevId = hasNav && index > 0 ? nav!.ids[index - 1] : null;
  const nextId =
    hasNav && index < nav!.ids.length - 1 ? nav!.ids[index + 1] : null;

  // Navigate to a sibling candidate. Panel mode keeps the current route
  // and only swaps ?candidate= (dropping tab + app focus) so the page
  // behind the overlay never changes; page mode changes the path.
  const goto = useCallback(
    (id: string | null) => {
      if (!id) return;
      if (mode === "panel") {
        router.push(buildUrl({ candidate: id, tab: null, app: null }), {
          scroll: false,
        });
      } else {
        router.push(`/candidates/${id}`);
      }
    },
    [router, mode, buildUrl],
  );

  const tabHref = useCallback(
    (value: CandidateTab) =>
      mode === "panel" ? buildUrl({ tab: value }) : `?tab=${value}`,
    [mode, buildUrl],
  );

  function closePanel() {
    router.push(buildUrl({ candidate: null, tab: null, app: null }), {
      scroll: false,
    });
  }

  // Keyboard nav: ← / → and J / K. Ignored while typing in a field so
  // editing the inspector doesn't hijack the arrows.
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
      if (e.key === "ArrowLeft" || e.key === "k" || e.key === "K") {
        if (prevId) {
          e.preventDefault();
          // Drop focus first so the focus-visible ring doesn't land on
          // some random button after the route swap.
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          goto(prevId);
        }
      } else if (e.key === "ArrowRight" || e.key === "j" || e.key === "J") {
        if (nextId) {
          e.preventDefault();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          goto(nextId);
        }
      } else if (e.key === "Escape") {
        // Esc: close the panel when overlaid; return to the list
        // origin when the profile is rendered as its own page.
        e.preventDefault();
        if (mode === "panel") closePanel();
        else router.push(backHref);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closePanel + router + mode + backHref are stable per render
    // pair; including them would re-bind the listener on every key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevId, nextId, goto]);

  function downloadCv() {
    setOverflowOpen(false);
    void getResumeSignedUrlAction(candidateId).then((res) => {
      if (!res.ok) {
        toast.saveFailed(res.error);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  // AI enrichment via DataForB2B. Runs server-side (Vercel IP, not the
  // user's local IP) so Cloudflare's residential-IP throttling on
  // /enrich/profile isn't a factor. Reuses the same action the
  // candidate-import flow uses.
  const [enriching, startEnrich] = useTransition();
  function enrichNow() {
    if (!linkedinUrl) return;
    startEnrich(async () => {
      const res = await enrichFromLinkedinAction({ urls: [linkedinUrl] });
      if (!res.ok) {
        toast.actionFailed(t("candidatesArea.enrichFailed"), res.error);
        return;
      }
      const item = res.data.results[0];
      if (item && (item.kind === "created" || item.kind === "reused")) {
        toast.actionOk(t("candidatesArea.enrichOk"));
        router.refresh();
      } else {
        toast.actionFailed(
          t("candidatesArea.enrichFailed"),
          item?.kind === "error" ? item.error : "unknown",
        );
      }
    });
  }

  // Manual Granola sync — pulls fresh transcripts from Granola and
  // tries to claim workspace orphans for this candidate by attendee
  // name match (handles the case where the candidate has no email
  // so Granola's email-based auto-link missed them).
  const [syncing, startSync] = useTransition();
  function syncGranola() {
    startSync(async () => {
      const res = await syncGranolaNowAction({ candidateId });
      if (!res.ok) {
        toast.actionFailed("Sync failed", res.error);
        return;
      }
      const { newlyLinkedToCandidate, notes_scanned } = res.data;
      toast.actionOk(
        newlyLinkedToCandidate > 0
          ? `Synced ${notes_scanned} note${notes_scanned === 1 ? "" : "s"}, linked ${newlyLinkedToCandidate} to this candidate`
          : `Synced ${notes_scanned} note${notes_scanned === 1 ? "" : "s"}, no new matches for this candidate`,
      );
      router.refresh();
    });
  }

  // Delete candidate from the workspace entirely. Different from the
  // per-vacante delete — this nukes the candidate record + all
  // applications across all jobs. Hard confirmation needed because
  // there's no undo.
  const [deleting, startDelete] = useTransition();
  function deleteNow() {
    const confirmed = window.confirm(
      t("candidatesArea.deleteCandidateConfirm").replace("{name}", fullName),
    );
    if (!confirmed) return;
    setOverflowOpen(false);
    startDelete(async () => {
      const res = await deleteCandidateAction(candidateId);
      if (!res.ok) {
        toast.actionFailed(t("candidatesArea.deleteCandidateFailed"), res.error);
        return;
      }
      toast.actionOk(t("candidatesArea.deleteCandidateOk"));
      // Navigate back to wherever they came from. Falls back to the
      // candidates index when no origin is stashed.
      router.push(nav?.origin ?? "/candidates");
    });
  }

  const backHref = nav?.origin ?? "/candidates";
  const backLabel = nav?.originLabel ?? t("candidatesArea.candidatesBack");

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg-1/95 backdrop-blur supports-[backdrop-filter]:bg-bg-1/80">
      <div className="mx-auto w-full max-w-6xl px-6">
        {/* Row 1: back/close + nav (left) · actions (right) */}
        <div className="flex items-center justify-between gap-3 pt-4">
          {/* LEFT: close + prev/next. Nav arrows used to sit on the
              right next to Enrich — moved here so the navigation
              affordance is grouped with the close action that
              shares the same "I'm done with this profile" mental
              model. */}
          <div className="flex items-center gap-3">
            {mode === "panel" ? (
              <button
                type="button"
                onClick={(e) => {
                  closePanel();
                  e.currentTarget.blur();
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <X className="h-3.5 w-3.5" />
                {t("candidatesArea.close")}
              </button>
            ) : (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <ArrowLeft className="h-3 w-3" />
                {backLabel}
              </Link>
            )}
            {hasNav ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={(e) => {
                    goto(prevId);
                    e.currentTarget.blur();
                  }}
                  disabled={!prevId}
                  aria-label={t("candidatesArea.navPrev")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 tabular-nums">
                  {index + 1} / {nav!.ids.length}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    goto(nextId);
                    e.currentTarget.blur();
                  }}
                  disabled={!nextId}
                  aria-label={t("candidatesArea.navNext")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {/* Header actions are supporting only — Enrich with AI when
                a LinkedIn URL is present, then overflow. "Add to job"
                moved into the APPLICATIONS card header (its natural
                home); "Send message" was removed. */}
            {linkedinUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={enrichNow}
                disabled={enriching}
                aria-label={t("candidatesArea.enrichWithAi")}
                title={t("candidatesArea.enrichWithAi")}
                className="gap-2 text-muted-foreground"
              >
                {enriching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {t("candidatesArea.enrichWithAi")}
              </Button>
            ) : null}

            {/* Sync Granola — pulls fresh calls + claims orphans
                whose attendee name fuzzy-matches this candidate.
                Useful right after a call (don't wait 15 min for
                the cron) AND for candidates with no email (their
                transcripts come in as workspace orphans and need
                manual claim by name). */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={syncGranola}
              disabled={syncing}
              aria-label="Sync Granola"
              title="Sync Granola"
              className="gap-2 text-muted-foreground"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync Granola
            </Button>

            {/* Overflow ··· */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOverflowOpen((o) => !o)}
                onBlur={() => setTimeout(() => setOverflowOpen(false), 150)}
                aria-label={t("common.more")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {overflowOpen ? (
                <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-md border border-border bg-background py-1 shadow-dropdown">
                  <button
                    type="button"
                    disabled={!hasResume}
                    onClick={downloadCv}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("candidatesArea.downloadCv")}
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOverflowOpen(false);
                      setConvertOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    {t("candidatesArea.convertToContact")}
                  </button>
                  {/* Destructive action — separated visually so it
                      isn't reached accidentally. */}
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={deleteNow}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {t("candidatesArea.deleteCandidate")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Row 2: identity */}
        <div className="flex items-start gap-3 py-4">
          {profilePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profilePictureUrl}
              alt={fullName}
              className="h-12 w-12 shrink-0 rounded-full border border-border bg-card object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
            >
              {initials(fullName)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <InlineNameEdit
                candidateId={candidateId}
                initialName={fullName}
              />
              {activeStage ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: (activeStage.color ?? "#94a3b8") + "22",
                    color: activeStage.color ?? "#475569",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: activeStage.color ?? "#94a3b8" }}
                  />
                  {activeStage.name}
                </span>
              ) : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {currentTitle || headline || t("candidatesArea.noHeadline")}
              {currentCompany ? (
                <>
                  {" · "}
                  <span className="text-foreground/70">{currentCompany}</span>
                </>
              ) : null}
            </p>
            {/* Contact essentials, condensed — replaces the old
                always-open inspector column. Email copies on click;
                phone shows next to a WhatsApp deep link; location is
                informational. Editing still happens in the Detalles
                accordion on the details tab. */}
            {email || phone || location ? (
              <ContactChips email={email} phone={phone} location={location} />
            ) : null}
            {linkedContactId ? (
              // Cross-history badge — the candidate was a contact at
              // some point. Links back so the user can see deal history.
              <Link
                href={`/contacts?contact=${linkedContactId}`}
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft/40 px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent-soft/70"
              >
                {t("candidatesArea.previouslyContact")}
              </Link>
            ) : null}
          </div>
        </div>

        {/* Row 3: tabs (URL-driven) */}
        <div
          role="tablist"
          aria-label={t("candidatesArea.tabsAriaLabel")}
          className="-mb-px flex items-center gap-1 text-sm"
        >
          <TabLink href={tabHref("details")} active={currentTab === "details"} label={t("candidatesArea.tabDetails")} />
          <TabLink href={tabHref("activity")} active={currentTab === "activity"} label={t("candidatesArea.tabActivity")} />
          <TabLink
            href={tabHref("conversations")}
            active={currentTab === "conversations"}
            label={t("candidatesArea.tabConversations")}
            icon={<MessageSquare className="h-3.5 w-3.5" />}
          />
        </div>
      </div>

      {/* AddToJobDialog moved into CandidateDetalles where the
          Applications card now hosts its trigger. */}
      <ConvertToContactDialog
        open={convertOpen}
        candidateId={candidateId}
        candidateName={fullName}
        onClose={() => setConvertOpen(false)}
      />
    </header>
  );
}

function TabLink({
  href,
  active,
  label,
  icon,
}: {
  href: string;
  active: boolean;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      role="tab"
      aria-selected={active}
      className={cn(
        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors",
        active
          ? "border-accent font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Condensed contact strip under the candidate name. Email copies to
 * clipboard on click (mirrors the LinkedIn-link affordance); phone
 * is a tel: link with a WhatsApp shortcut beside it; location is
 * read-only context. Editing lives in the Detalles accordion.
 */
function ContactChips({
  email,
  phone,
  location,
}: {
  email: string | null;
  phone: string | null;
  location: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const waDigits = phone ? phone.replace(/[^\d]/g, "") : "";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {email ? (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(email)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              })
              .catch(() => {});
          }}
          title="Copiar correo"
          className="inline-flex items-center gap-1 rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Mail className="h-3 w-3" />
          <span className="max-w-[220px] truncate">{email}</span>
          {copied ? (
            <Check className="h-3 w-3 text-positive" />
          ) : (
            <Copy className="h-3 w-3 opacity-50" />
          )}
        </button>
      ) : null}
      {phone ? (
        <span className="inline-flex items-center gap-1.5">
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1 rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Phone className="h-3 w-3" />
            {phone}
          </a>
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp"
              aria-label="WhatsApp"
              className="inline-flex items-center rounded p-0.5 transition-opacity hover:opacity-80"
            >
              {/* Inline WhatsApp mark (same path used by the contact
                  inspector) — lucide has no brand icons. */}
              <svg
                viewBox="0 0 24 24"
                fill="#25D366"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </a>
          ) : null}
        </span>
      ) : null}
      {location ? (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          <span className="max-w-[220px] truncate">{location}</span>
        </span>
      ) : null}
    </div>
  );
}
