"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  passwordSignInAction,
  sendMagicLinkAction,
} from "./actions";

export function LoginForm({
  initialError,
  initialSent,
}: {
  initialError?: string;
  initialSent?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(
    initialSent ? `Magic link enviado a ${initialSent}.` : null,
  );
  const [isPending, startTransition] = useTransition();

  function onMagicLink() {
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set("email", email);
    startTransition(async () => {
      const res = await sendMagicLinkAction(fd);
      if (!res.ok) setError(res.error);
      else setInfo(res.message ?? "Magic link enviado.");
    });
  }

  function onPasswordSignIn() {
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    startTransition(async () => {
      const res = await passwordSignInAction(fd);
      // On success the action redirects, so we only see this on failure.
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Email</span>
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
        type="button"
        onClick={onMagicLink}
        disabled={isPending || email.length === 0}
        className="w-full"
      >
        {isPending ? "Enviando…" : "Enviarme magic link"}
      </Button>

      <button
        type="button"
        onClick={() => setShowPassword((v) => !v)}
        className="block text-xs text-muted-foreground hover:text-foreground"
      >
        {showPassword ? "Ocultar" : "Iniciar con contraseña"}
      </button>

      {showPassword ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Contraseña
            </span>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={onPasswordSignIn}
            disabled={isPending || !email || !password}
            className="w-full"
          >
            {isPending ? "Entrando…" : "Entrar con contraseña"}
          </Button>
        </div>
      ) : null}

      {info ? (
        <p className="text-xs text-green-700">{info}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
