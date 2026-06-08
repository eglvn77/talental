"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Calls our /api/integrations/unipile/connect endpoint to mint a
 * one-time hosted-auth URL, then opens it in a new tab. Unipile
 * redirects back to /settings/integrations?status=success once the
 * user finishes the wizard; the webhook persists the connection.
 */
export function ConnectLinkedinButton({
  providers,
  reconnectAccountId,
  label,
}: {
  providers: Array<"LINKEDIN" | "WHATSAPP" | "GOOGLE">;
  reconnectAccountId?: string;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/unipile/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers, reconnectAccountId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        url?: string;
        error?: string;
      };
      if (!json.ok || !json.url) {
        setError(json.error ?? "No se pudo iniciar la conexión.");
        return;
      }
      // Open the Unipile wizard in a new tab so the user doesn't
      // lose their place in /settings/integrations.
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-bone hover:opacity-90 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {label}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
