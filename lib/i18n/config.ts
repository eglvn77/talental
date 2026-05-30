/**
 * i18n core config. Locale is stored in a cookie (`locale`) so the
 * choice follows the browser without URL routing — least invasive for
 * an app that's already fully built. Default is Spanish (the app's
 * original language); English is the alternate.
 *
 * Scope: the SYSTEM UI only. User data, custom fields, and AI-generated
 * content (JD, kickoff package, etc.) are NOT translated here — they
 * follow their own per-record language settings.
 */

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "locale";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export const LOCALE_LABEL: Record<Locale, string> = {
  es: "Español",
  en: "English",
};
