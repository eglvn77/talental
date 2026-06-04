import type { ReactNode } from "react";
import { getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";

/**
 * Portal shell. Lives OUTSIDE (app) so it has zero workspace auth,
 * zero sidebar — just the locale provider and the body. Branding +
 * header live per-page so they can show the right company logo.
 */
export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  return (
    <LocaleProvider locale={locale}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        {children}
      </div>
    </LocaleProvider>
  );
}
