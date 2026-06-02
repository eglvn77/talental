"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { AddToJobDialog, type AddToJobOption } from "./add-to-job-dialog";

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

type TabId = "details" | "activity" | "conversations";

export function CandidateScreen({
  candidateId,
  fullName,
  headline,
  currentTitle,
  currentCompany,
  profilePictureUrl,
  activeStage,
  hasResume,
  addToJobOptions,
  detailsSlot,
  activitySlot,
  conversationsSlot,
}: {
  candidateId: string;
  fullName: string;
  headline: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  profilePictureUrl: string | null;
  activeStage: { name: string; color: string | null } | null;
  hasResume: boolean;
  addToJobOptions: AddToJobOption[];
  detailsSlot: ReactNode;
  activitySlot: ReactNode;
  conversationsSlot: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("details");
  const [nav, setNav] = useState<CandidateNavContext | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

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

  const goto = useCallback(
    (id: string | null) => {
      if (!id) return;
      router.push(`/candidates/${id}`);
    },
    [router],
  );

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
          goto(prevId);
        }
      } else if (e.key === "ArrowRight" || e.key === "j" || e.key === "J") {
        if (nextId) {
          e.preventDefault();
          goto(nextId);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId, goto]);

  const backHref = nav?.origin ?? "/candidates";
  const backLabel = nav?.originLabel ?? t("candidatesArea.candidatesBack");

  return (
    <div className="flex min-h-0 flex-col">
      {/* ---- Fixed header ---- */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg-1/95 backdrop-blur supports-[backdrop-filter]:bg-bg-1/80">
        <div className="mx-auto w-full max-w-6xl px-6">
          {/* Row 1: back · nav · actions */}
          <div className="flex items-center justify-between gap-3 pt-4">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              {backLabel}
            </Link>

            <div className="flex items-center gap-2">
              {hasNav ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => goto(prevId)}
                    disabled={!prevId}
                    aria-label={t("candidatesArea.navPrev")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="tabular-nums px-1">
                    {index + 1} / {nav!.ids.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => goto(nextId)}
                    disabled={!nextId}
                    aria-label={t("candidatesArea.navNext")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}

              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddOpen(true)}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addToJob.action")}
              </Button>
              <Button
                size="sm"
                onClick={() => setTab("conversations")}
                className="gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t("candidatesArea.sendMessage")}
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
                  <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-border bg-background py-1 shadow-dropdown">
                    <button
                      type="button"
                      disabled={!hasResume}
                      onClick={() => {
                        setOverflowOpen(false);
                        setTab("details");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("candidatesArea.downloadCv")}
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
                <h1 className="truncate text-xl font-semibold">{fullName}</h1>
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
            </div>
          </div>

          {/* Row 3: tabs */}
          <div
            role="tablist"
            aria-label={t("candidatesArea.tabsAriaLabel")}
            className="-mb-px flex items-center gap-1 text-sm"
          >
            <TabBtn current={tab} value="details" onClick={setTab} label={t("candidatesArea.tabDetails")} />
            <TabBtn current={tab} value="activity" onClick={setTab} label={t("candidatesArea.tabActivity")} />
            <TabBtn
              current={tab}
              value="conversations"
              onClick={setTab}
              label={t("candidatesArea.tabConversations")}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </header>

      {/* ---- Scrollable content ---- */}
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        {tab === "details" ? detailsSlot : null}
        {tab === "activity" ? activitySlot : null}
        {tab === "conversations" ? conversationsSlot : null}
      </div>

      <AddToJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidateId={candidateId}
        options={addToJobOptions}
      />
    </div>
  );
}

function TabBtn({
  value,
  current,
  onClick,
  label,
  icon,
}: {
  value: TabId;
  current: TabId;
  onClick: (t: TabId) => void;
  label: string;
  icon?: ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(value)}
      className={cn(
        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors",
        active
          ? "border-accent font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
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
