import { loadCareersWorkspaceHeader } from "../_lib/data";

/**
 * Per-workspace layout. Its only job is to override the document's
 * `data-theme` attribute so the public careers site renders with the
 * theme the agency picked in /settings/careers, *not* the recruiter's
 * personal ATS theme stamped by the root layout from localStorage.
 *
 * The root layout (app/layout.tsx) already ran an inline script in
 * <head> that read `localStorage.tlt_theme` and set <html data-theme>.
 * That script doesn't know about the careers route. Here, deeper in
 * the tree, we emit another inline script that re-stamps the
 * attribute based on the workspace setting — runs after the root's,
 * wins.
 *
 * - 'light' / 'dark' → stamp that value explicitly.
 * - 'system'         → unset the override so the OS preference (via
 *                      the `prefers-color-scheme` CSS fallback in
 *                      globals.css) takes effect.
 *
 * If the slug doesn't resolve to a workspace, we don't emit the
 * script — the inner page will 404 anyway and we shouldn't override
 * the recruiter's own theme just because they typed a bad URL.
 */
export default async function CareersWorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ ws: string }>;
  children: React.ReactNode;
}) {
  const { ws } = await params;
  const header = await loadCareersWorkspaceHeader(ws);
  const theme = header?.careers_theme ?? "light";

  const script =
    theme === "system"
      ? `try{document.documentElement.removeAttribute("data-theme");}catch(e){}`
      : `try{document.documentElement.setAttribute("data-theme","${theme}");}catch(e){}`;

  return (
    <>
      <script
        // Runs before paint of the page below — sets the right
        // theme before any element gets a chance to render in the
        // wrong palette. eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: script }}
      />
      {children}
    </>
  );
}
