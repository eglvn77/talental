"use client";

import { useState } from "react";
import { Check, Copy, Linkedin, Mail } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/**
 * Compact share-link cluster for a careers posting. Mounted in the
 * sidebar above the apply CTA. Each button opens a platform's share
 * intent in a new tab — except "Copiar", which copies the canonical
 * URL to the clipboard and flashes a confirmation.
 *
 * URL is resolved client-side from `window.location.href` so we get
 * the right origin in dev / preview / prod without env-var plumbing.
 */
export function ShareButtons({ jobTitle }: { jobTitle: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  // Lazy build: the URL is read at click-time so we don't snapshot
  // an SSR-empty value into useState. Each handler grabs fresh.
  function currentUrl() {
    return typeof window !== "undefined" ? window.location.href : "";
  }
  function shareText() {
    return t("careers.shareMessage", { title: jobTitle });
  }

  function openWhatsApp() {
    const text = `${shareText()}\n${currentUrl()}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openLinkedIn() {
    // LinkedIn's "share" endpoint only respects the url param;
    // text/title come from the destination's OG metadata, which is
    // why generateMetadata in the page route matters.
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl())}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openMail() {
    const subject = encodeURIComponent(jobTitle);
    const body = encodeURIComponent(`${shareText()}\n${currentUrl()}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(currentUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail in some embedded webviews — fall back
      // silently rather than throwing a toast on the public site.
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {t("careers.share")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <ShareIcon
          onClick={openWhatsApp}
          label="WhatsApp"
          icon={<WhatsAppIcon className="h-4 w-4" />}
        />
        <ShareIcon
          onClick={openLinkedIn}
          label="LinkedIn"
          icon={<Linkedin className="h-4 w-4" />}
        />
        <ShareIcon
          onClick={openMail}
          label={t("careers.shareEmail")}
          icon={<Mail className="h-4 w-4" />}
        />
        <ShareIcon
          onClick={copyLink}
          label={copied ? t("careers.copied") : t("careers.copyLink")}
          icon={
            copied ? (
              <Check className="h-4 w-4 text-positive" />
            ) : (
              <Copy className="h-4 w-4" />
            )
          }
        />
      </div>
    </div>
  );
}

/**
 * WhatsApp glyph as an inline SVG. lucide-react doesn't ship a
 * WhatsApp icon (trademark policy), and using the brand-green
 * pillow would clash with the Distillate palette here. We render
 * the silhouette in `currentColor` so it inherits the share button's
 * muted-foreground → foreground hover treatment exactly like the
 * other icons in the cluster.
 *
 * Path is the canonical WhatsApp glyph traced for a 24×24 viewBox.
 */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.01zM12.05 20.15h-.01a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.42 5.83c-.01 4.54-3.71 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13s-.64.81-.79.97c-.15.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23a7.47 7.47 0 0 1-1.38-1.72c-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.49-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.05 0 1.21.88 2.38 1 2.54.12.17 1.74 2.65 4.21 3.72.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.3z" />
    </svg>
  );
}

function ShareIcon({
  onClick,
  label,
  icon,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-bg-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {icon}
    </button>
  );
}
