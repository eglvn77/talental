"use client";

import { useState } from "react";
import { Check, Copy, Linkedin, Mail, MessageCircle } from "lucide-react";

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
  const [copied, setCopied] = useState(false);

  // Lazy build: the URL is read at click-time so we don't snapshot
  // an SSR-empty value into useState. Each handler grabs fresh.
  function currentUrl() {
    return typeof window !== "undefined" ? window.location.href : "";
  }
  function shareText() {
    return `Mira esta vacante: ${jobTitle}`;
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
        Compartir
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <ShareIcon
          onClick={openWhatsApp}
          label="WhatsApp"
          icon={<MessageCircle className="h-4 w-4" />}
        />
        <ShareIcon
          onClick={openLinkedIn}
          label="LinkedIn"
          icon={<Linkedin className="h-4 w-4" />}
        />
        <ShareIcon
          onClick={openMail}
          label="Correo"
          icon={<Mail className="h-4 w-4" />}
        />
        <ShareIcon
          onClick={copyLink}
          label={copied ? "Copiado" : "Copiar link"}
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
