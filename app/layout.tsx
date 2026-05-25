import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

/**
 * Talental — Distillate typography.
 *
 * DM Sans does everything visual (body, UI, headings, displays, wordmark).
 * DM Mono is metadata only — uppercase, tracked, used in pills, table
 * headers, eyebrows, dates, IDs.
 *
 * Weights per the handoff:
 *   - DM Sans: 400 / 500 / 600 / 700
 *   - DM Mono: 400 / 500
 *
 * Exposed as CSS variables so globals.css can route them into the
 * Tailwind `--font-sans` / `--font-mono` tokens.
 */
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Talental AI",
  description:
    "Sistema de gestión de talento para empresas de tecnología en Latinoamérica.",
  robots: { index: false, follow: false },
  // Favicon is served straight from the canonical brand assets in
  // /public/brand/svg/ rather than a duplicated copy under /app —
  // single source of truth for the T. mark across the app, the
  // browser tab, and dark/light theme. Two declarations with
  // `media` queries let the browser pick the right file based on the
  // OS theme. apple-icon still uses the Next file-based convention.
  icons: {
    icon: [
      {
        url: "/brand/svg/talental-t.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/brand/svg/talental-t-on-ink.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
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
    <html
      lang="es"
      className={`${dmSans.variable} ${dmMono.variable} h-full`}
    >
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
