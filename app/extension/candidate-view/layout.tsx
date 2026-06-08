/**
 * Minimal layout for the Chrome Side Panel's iframe target.
 *
 * Lives OUTSIDE the (app) route group on purpose — we don't want
 * the app sidebar, top bar, or search palette here. The side panel
 * is 400px wide; chrome would steal half the visible space.
 *
 * Inherits <html>, <body>, fonts, and theme initialization from
 * the root layout (app/layout.tsx). This layout is just a passthrough
 * container so we have a clean place to add side-panel-only chrome
 * later (e.g. a tiny header bar) without touching the root.
 */
export default function ExtensionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen">{children}</div>;
}
