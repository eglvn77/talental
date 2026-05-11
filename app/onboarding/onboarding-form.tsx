"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeOnboardingAction } from "./actions";

const MIN = 2;

export function OnboardingForm() {
  const [fullName, setFullName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    if (fullName.trim().length < MIN) {
      setError("Tu nombre debe tener al menos 2 caracteres.");
      return;
    }
    if (teamName.trim().length < MIN) {
      setError("El nombre del equipo debe tener al menos 2 caracteres.");
      return;
    }
    const fd = new FormData();
    fd.set("full_name", fullName);
    fd.set("agency_name", teamName);
    startTransition(async () => {
      const res = await completeOnboardingAction(fd);
      if (res && !res.ok) setError(res.error);
      // Success redirects server-side.
    });
  }

  const ready =
    fullName.trim().length >= MIN && teamName.trim().length >= MIN;

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
          Nombre de tu equipo
        </span>
        <Input
          autoComplete="organization"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          required
          minLength={MIN}
          placeholder="Ej. Talental, Acme Recruiting, etc."
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
