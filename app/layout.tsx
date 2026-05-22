import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talental",
  description: "Plataforma de reclutamiento de Talental.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

/**
 * Read the user's stored theme preference and stamp data-theme onto
 * <html> BEFORE React hydrates. Without this, a "dark" user reloading
 * the app would briefly flash the light palette (FOUC). Inline because
 * it must run synchronously in the document head, before the body
 * paints. Reads/writes localStorage.tlt_theme = "light" | "dark" |
 * "system" (or absent = system).
 */
const THEME_INIT_SCRIPT = `
(function(){try{
  var t = localStorage.getItem("tlt_theme");
  if (t === "light" || t === "dark") {
    document.documentElement.setAttribute("data-theme", t);
  }
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${GeistSans.variable} h-full`}>
      <head>
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
