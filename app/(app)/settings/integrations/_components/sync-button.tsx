"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { syncConnectedAccountsAction } from "../_actions";

/**
 * Page-level manual sync trigger. Auto-sync runs on page load, but
 * this button lets the recruiter explicitly force it (e.g. after
 * fixing something at the Unipile dashboard) and see the result
 * inline without having to refresh.
 */
export function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function go() {
    setMsg(null);
    startTransition(async () => {
      const res = await syncConnectedAccountsAction();
      if (!res.ok) {
        setMsg(`Error: ${res.error}`);
        return;
      }
      setMsg(`Sincronizado: ${res.synced} cuenta${res.synced === 1 ? "" : "s"}`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        Sync from Unipile
      </button>
      {msg ? (
        <span className="text-xs text-muted-foreground">{msg}</span>
      ) : null}
    </div>
  );
}
