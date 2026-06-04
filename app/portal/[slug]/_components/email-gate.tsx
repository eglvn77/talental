"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import { portalLoginAction } from "../actions";

export function EmailGate({ slug }: { slug: string }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await portalLoginAction({ slug, email });
      if (!res.ok) {
        setError(
          res.error === "tokenInvalid"
            ? t("portal.tokenInvalid")
            : res.error === "emailNotAllowed"
              ? t("portal.emailNotAllowed")
              : t("portal.emailInvalid"),
        );
      }
      // On ok, server redirects — no client navigation needed.
    });
  }

  return (
    <div className="mx-auto mt-24 w-full max-w-sm rounded-lg border border-border bg-bg-2 p-6 shadow-sm">
      <h1 className="text-base font-semibold">{t("portal.emailGateTitle")}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("portal.emailGateHint")}
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <Input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.com"
        />
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full gap-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("portal.emailGateSubmit")}
        </Button>
      </form>
    </div>
  );
}
