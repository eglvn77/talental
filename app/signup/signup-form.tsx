"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signupAction } from "./actions";

const MIN_PASSWORD = 8;

export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    setInfo(null);
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    const fd = new FormData();
    fd.set("full_name", fullName);
    fd.set("email", email);
    fd.set("agency_name", agencyName);
    fd.set("password", password);
    startTransition(async () => {
      const res = await signupAction(fd);
      if (!res.ok) setError(res.error);
      else setInfo(res.message);
    });
  }

  const ready =
    fullName.trim() &&
    email.trim() &&
    agencyName.trim() &&
    password.length >= MIN_PASSWORD;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Tu nombre
        </span>
        <Input
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="mt-1"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Correo</span>
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
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
          className="mt-1"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Contraseña
        </span>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD}
          className="mt-1"
        />
        <span className="mt-1 block text-[11px] text-muted-foreground">
          Mínimo {MIN_PASSWORD} caracteres.
        </span>
      </label>

      <Button
        type="button"
        onClick={onSubmit}
        disabled={isPending || !ready}
        className="w-full"
      >
        {isPending ? "Creando…" : "Crear cuenta"}
      </Button>

      {info ? <p className="text-xs text-green-700">{info}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
