"use client";

import { useState, useTransition } from "react";
import {
  Share2,
  Link as LinkIcon,
  Copy,
  ExternalLink,
  Power,
  Loader2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  getApplicationShareTokenAction,
  getOrCreateApplicationShareTokenAction,
  setApplicationShareTokenActiveAction,
} from "@/app/(app)/_actions/portal-tokens";

/**
 * Icon-only share control that lives in the application row.
 *
 * UX rules (per recruiter):
 *   - Simple icon to copy. No giant button.
 *   - Don't regenerate on every click — the share link must be
 *     stable. We call get-or-create on first interaction; later
 *     opens reuse the same slug.
 *   - There must be a way to disable the link.
 *
 * Layout: one trigger icon that opens a small dropdown menu with
 * Copy / Open / Enable-Disable. Active state is reflected by the
 * icon: dim Share2 when no token yet OR token disabled; filled
 * Link icon with an accent dot when an active token exists.
 *
 * Token state is loaded lazily — when the dropdown opens for the
 * first time we call getApplicationShareTokenAction so the menu
 * shows the right enable/disable label. Avoids prefetching for
 * every application row.
 */
export function ApplicationShareButton({
  applicationId,
}: {
  applicationId: string;
}) {
  type State =
    | { kind: "unknown" } // haven't asked yet
    | { kind: "none" } // never generated
    | { kind: "active"; slug: string }
    | { kind: "disabled"; slug: string };

  const [state, setState] = useState<State>({ kind: "unknown" });
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function buildUrl(slug: string): string {
    return `${window.location.origin}/portal/${slug}`;
  }

  async function loadState() {
    const res = await getApplicationShareTokenAction({ applicationId });
    if (!res.ok) {
      setState({ kind: "none" });
      return;
    }
    if (!res.data) {
      setState({ kind: "none" });
      return;
    }
    setState(
      res.data.isActive
        ? { kind: "active", slug: res.data.slug }
        : { kind: "disabled", slug: res.data.slug },
    );
  }

  function copyToClipboard(slug: string) {
    const url = buildUrl(slug);
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.actionOk("Link copied"))
      .catch(() => toast.actionOk(url)); // fallback: show URL
  }

  function handleCopy() {
    setOpen(false);
    startTransition(async () => {
      // Either we already know the slug, or we get-or-create it.
      let slug: string | null =
        state.kind === "active" || state.kind === "disabled"
          ? state.slug
          : null;
      if (!slug) {
        const res = await getOrCreateApplicationShareTokenAction({
          applicationId,
        });
        if (!res.ok) {
          toast.actionFailed("Couldn't generate link", res.error);
          return;
        }
        slug = res.data.slug;
        setState({ kind: "active", slug });
      } else if (state.kind === "disabled") {
        // Trying to copy a disabled link: re-enable first so the URL
        // actually works for the recipient.
        const res = await setApplicationShareTokenActiveAction({
          applicationId,
          active: true,
        });
        if (!res.ok) {
          toast.actionFailed("Couldn't re-enable link", res.error);
          return;
        }
        setState({ kind: "active", slug: res.data.slug });
        slug = res.data.slug;
      }
      copyToClipboard(slug);
    });
  }

  function handleOpen() {
    setOpen(false);
    if (state.kind === "active" || state.kind === "disabled") {
      window.open(buildUrl(state.slug), "_blank", "noopener,noreferrer");
    } else {
      // Need to create first.
      handleCopy(); // copy flow generates; opener can follow-up.
    }
  }

  function handleToggleActive() {
    setOpen(false);
    if (state.kind === "unknown" || state.kind === "none") return;
    const nextActive = state.kind === "disabled";
    startTransition(async () => {
      const res = await setApplicationShareTokenActiveAction({
        applicationId,
        active: nextActive,
      });
      if (!res.ok) {
        toast.actionFailed(
          nextActive ? "Couldn't enable" : "Couldn't disable",
          res.error,
        );
        return;
      }
      setState(
        nextActive
          ? { kind: "active", slug: res.data.slug }
          : { kind: "disabled", slug: res.data.slug },
      );
      toast.actionOk(nextActive ? "Link enabled" : "Link disabled");
    });
  }

  const isActiveToken = state.kind === "active";

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && state.kind === "unknown") void loadState();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Share link"
          title="Share link"
          disabled={pending}
          className={
            "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-50 " +
            (isActiveToken
              ? "text-accent hover:bg-accent/10"
              : "text-muted-foreground hover:bg-muted hover:text-foreground")
          }
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isActiveToken ? (
            <LinkIcon className="h-3.5 w-3.5" />
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          {isActiveToken ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent"
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleCopy(); }}>
          <Copy className="h-3.5 w-3.5" />
          {state.kind === "none" || state.kind === "unknown"
            ? "Generate & copy"
            : "Copy link"}
        </DropdownMenuItem>
        {state.kind === "active" || state.kind === "disabled" ? (
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); handleOpen(); }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open preview
          </DropdownMenuItem>
        ) : null}
        {state.kind === "active" || state.kind === "disabled" ? (
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); handleToggleActive(); }}
            className={
              state.kind === "active"
                ? "text-danger focus:bg-danger/10"
                : undefined
            }
          >
            <Power className="h-3.5 w-3.5" />
            {state.kind === "active" ? "Disable link" : "Re-enable link"}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
