"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeOnboardingAction } from "./actions";

const MIN = 2;

export function OnboardingForm({
  initialFullName,
  initialAgencyName,
}: {
  initialFullName?: string;
  initialAgencyName?: string;
}) {
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [agencyName, setAgencyName] = useState(initialAgencyName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    if (fullName.trim().length < MIN) {
      setError("Tu nombre debe tener al menos 2 caracteres.");
      return;
    }
    if (agencyName.trim().length < MIN) {
      setError("El nombre de la agencia debe tener al menos 2 caracteres.");
      return;
    }
    const fd = new FormData();
    fd.set("full_name", fullName);
    fd.set("agency_name", agencyName);
    startTransition(async () => {
      const res = await completeOnboardingAction(fd);
      if (res && !res.ok) setError(res.error);
      // Success redirects server-side.
    });
  }

  const ready =
    fullName.trim().length >= MIN && agencyName.trim().length >= MIN;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Nombre completo
        </span>
        <Input
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          minLength={MIN}
          className="mt-1"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Nombre de tu agencia
        </span>
        <Input
          autoComplete="organization"
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
          required
          minLength={MIN}
          className="mt-1"
        />
      </label>

      <Button
        type="button"
        onClick={onSubmit}
        disabled={isPending || !ready}
        className="w-full"
      >
        {isPending ? "Guardando…" : "Continuar"}
      </Button>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
