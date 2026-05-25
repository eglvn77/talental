"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction } from "./actions";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set("email", email);
    startTransition(async () => {
      const res = await forgotPasswordAction(fd);
      if (!res.ok) setError(res.error);
      else setInfo(res.message);
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
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

      <Button
        type="submit"
        disabled={isPending || !email}
        className="w-full"
      >
        {isPending ? "Enviando…" : "Enviar link de recuperación"}
      </Button>

      {info ? <p className="text-xs text-green-700">{info}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}
