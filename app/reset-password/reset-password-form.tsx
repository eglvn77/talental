"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordAction } from "./actions";

const MIN_PASSWORD = 8;

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    const fd = new FormData();
    fd.set("password", password);
    fd.set("confirm", confirm);
    startTransition(async () => {
      const res = await resetPasswordAction(fd);
      // Success redirects to /login?reset=ok; only failure returns here.
      if (res && !res.ok) setError(res.error);
    });
  }

  const ready = password.length >= MIN_PASSWORD && confirm === password;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Nueva contraseña
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

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Confirmar contraseña
        </span>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD}
          className="mt-1"
        />
      </label>

      <Button
        type="submit"
        disabled={isPending || !ready}
        className="w-full"
      >
        {isPending ? "Cambiando…" : "Cambiar contraseña"}
      </Button>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}
