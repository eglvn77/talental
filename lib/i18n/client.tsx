"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import { MESSAGES } from "./messages";
import { translate, type TFunction } from "./translate";

type Ctx = { locale: Locale; t: TFunction };

const LocaleContext = createContext<Ctx | null>(null);

/**
 * Provides the active locale + translator to client components. Mounted
 * once near the app root with the request's locale. The messages live
 * in the bundle (small), so the client doesn't refetch them.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<Ctx>(() => {
    const messages = MESSAGES[locale];
    return { locale, t: (key, vars) => translate(messages, key, vars) };
  }, [locale]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/** Translator hook for client components: const t = useT(). */
export function useT(): TFunction {
  const ctx = useContext(LocaleContext);
  // Fallback to Spanish if used outside a provider (shouldn't happen in
  // app routes, but keeps isolated component tests from crashing).
  return ctx?.t ?? ((key, vars) => translate(MESSAGES.es, key, vars));
}

export function useLocale(): Locale {
  return useContext(LocaleContext)?.locale ?? "es";
}
