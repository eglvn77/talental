import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import { getLocale } from "@/lib/i18n/server";
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
  // browser tab, and dark/light theme. The icon is intentionally
  // pinned to the light-mode variant (no prefers-color-scheme split)
  // so the tab favicon stays consistent no matter what theme the OS
  // is in — per recruiter request, only the in-app UI flips.
  // apple-icon still uses the Next file-based convention.
  icons: {
    icon: [
      {
        url: "/brand/svg/talental-t.svg",
        type: "image/svg+xml",
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${dmSans.variable} ${dmMono.variable} h-full`}
    >
      <head>
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Global SVG definitions. The AI-icon gradient lives here so
            any .btn-ai button can paint its lucide icon stroke with
            the full ramp via `stroke: url(#ai-icon-gradient)` —
            otherwise lucide's currentColor wouldn't pick up a CSS
            gradient. Hidden from layout via width/height/position. */}
        <svg
          width="0"
          height="0"
          aria-hidden
          style={{ position: "absolute" }}
        >
          <defs>
            <linearGradient
              id="ai-icon-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#5C6B3F" />
              <stop offset="14%" stopColor="#7FA796" />
              <stop offset="28%" stopColor="#6E8DCF" />
              <stop offset="42%" stopColor="#A57CB8" />
              <stop offset="57%" stopColor="#D9A26E" />
              <stop offset="71%" stopColor="#7FA796" />
              <stop offset="85%" stopColor="#9DAE7C" />
              <stop offset="100%" stopColor="#5C6B3F" />
            </linearGradient>
          </defs>
        </svg>
        {children}
      </body>
    </html>
  );
}
