import "@/app/globals.css";

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
 */
export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-bg-1">{children}</div>;
}
