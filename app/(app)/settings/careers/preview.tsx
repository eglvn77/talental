"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/**
 * Live preview of the workspace's public careers landing, embedded in
 * /settings/careers via an iframe. Doesn't auto-refresh on every
 * branding-field commit (auto-poking the iframe from a sibling form
 * is more fragile than it looks); instead the recruiter clicks
 * "Refrescar" when they want to see their last edit applied. The
 * iframe carries an internal counter so each refresh forces a fresh
 * navigation rather than relying on browser cache invalidation.
 */
export function CareersPreview({ href }: { href: string }) {
  const t = useT();
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [nonce, setNonce] = useState(0);
  return (
    <div className="space-y-2 rounded-md border border-border bg-bg-1">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("careersCfg.preview")}
        </span>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("careersCfg.refreshPreview")}
          title={t("careersCfg.refreshPreview")}
        >
          <RefreshCw className="h-3 w-3" />
          {t("careersCfg.refresh")}
        </button>
      </div>
      <iframe
        ref={ref}
        // Including the nonce in the query string forces React to
        // re-render the iframe element with a new src, which the
        // browser treats as a fresh navigation (vs reusing a cached
        // doc when only the hash changes).
        src={`${href}?_p=${nonce}`}
        title={t("careersCfg.careersSitePreviewTitle")}
        className="block h-[600px] w-full rounded-b-md bg-background"
      />
    </div>
  );
}
