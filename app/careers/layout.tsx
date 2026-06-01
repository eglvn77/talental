import "@/app/globals.css";
import { getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";

/**
 * Careers site layout. Standalone — does NOT inherit the authenticated
 * `(app)` chrome (sidebar, top bar, user menu). The pages mounted under
 * this route are reachable from the anonymous careers subdomain
 * (`jobs.<root>/<workspace>/<job-slug>`) and from the workspace landing
 * (`jobs.<root>/<workspace>`).
 *
 * Branding chrome (workspace logo + tagline) lives inside the page
 * components themselves so each page can pull its own workspace row;
 * the layout just provides the document shell.
 *
 * Wraps the tree in <LocaleProvider> so the public site's client
 * components (jobs list, apply modal, share buttons) can translate via
 * useT(). The locale comes from the same `locale` cookie the in-app
 * switcher writes; visitors flip it with the globe control in the
 * careers header.
 */
export default async function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <LocaleProvider locale={locale}>
      <div className="min-h-screen bg-bg-1">{children}</div>
    </LocaleProvider>
  );
}
