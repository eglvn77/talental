"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleIcon } from "./google-icon";
import {
  passwordSignInAction,
  sendMagicLinkAction,
} from "./actions";
import { googleOAuthAction } from "./oauth-actions";

export function LoginForm({
  initialError,
  initialSent,
  initialNext,
}: {
  initialError?: string;
  initialSent?: string;
  initialNext?: string;
}) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(
    initialSent ? `Magic link enviado a ${initialSent}.` : null,
  );
  const [isPending, startTransition] = useTransition();

  function onPasswordSignIn() {
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    if (initialNext) fd.set("next", initialNext);
    startTransition(async () => {
      const res = await passwordSignInAction(fd);
      // On success the action redirects, so we only see this on failure.
      if (res && !res.ok) setError(res.error);
    });
  }

  function onMagicLink() {
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set("email", email);
    if (initialNext) fd.set("next", initialNext);
    startTransition(async () => {
      const res = await sendMagicLinkAction(fd);
      if (!res.ok) setError(res.error);
      else setInfo(res.message ?? "Magic link enviado.");
    });
  }

  return (
    <div className="space-y-3">
      <form action={googleOAuthAction}>
        {initialNext ? (
          <input type="hidden" name="next" value={initialNext} />
        ) : null}
        <Button
          type="submit"
          variant="outline"
          className="w-full gap-2"
        >
          <GoogleIcon className="h-4 w-4" />
          Continuar con Google
        </Button>
      </form>

      <div className="relative flex items-center">
        <span className="flex-1 border-t border-border" />
        <span className="px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          o
        </span>
        <span className="flex-1 border-t border-border" />
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "password") onPasswordSignIn();
          else onMagicLink();
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

        {mode === "password" ? (
          <>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Contraseña
              </span>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1"
              />
            </label>

            <Button
              type="submit"
              disabled={isPending || !email || !password}
              className="w-full"
            >
              {isPending ? "Entrando…" : "Iniciar sesión"}
            </Button>

            <div className="flex items-center justify-between text-xs">
              <Link
                href="/forgot-password"
                className="text-muted-foreground hover:text-foreground"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <div className="relative my-1 flex items-center">
              <span className="flex-1 border-t border-border" />
              <span className="px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                o
              </span>
              <span className="flex-1 border-t border-border" />
            </div>

            <button
              type="button"
              onClick={() => {
                setMode("magic");
                setPassword("");
                setError(null);
                setInfo(null);
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Iniciar sesión con magic link
            </button>
          </>
        ) : (
          <>
            <Button
              type="submit"
              disabled={isPending || email.length === 0}
              className="w-full"
            >
              {isPending ? "Enviando…" : "Enviar magic link"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("password");
                setError(null);
                setInfo(null);
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Usar contraseña
            </button>
          </>
        )}
      </form>

      {info ? <p className="text-xs text-green-700">{info}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
