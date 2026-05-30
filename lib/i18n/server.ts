import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { MESSAGES, type Messages } from "./messages";
import { translate, type TFunction } from "./translate";

/** The active locale for this request (from the `locale` cookie). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getMessages(): Promise<Messages> {
  return MESSAGES[await getLocale()];
}

/**
 * Server-component translator. `const t = await getT()` then
 * `t("nav.candidates")`.
 */
export async function getT(): Promise<TFunction> {
  const messages = await getMessages();
  return (key, vars) => translate(messages, key, vars);
}
