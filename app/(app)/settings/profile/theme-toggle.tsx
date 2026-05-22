"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "system" | "light" | "dark";

const OPTIONS: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
];

/**
 * Theme picker — three states (Sistema / Claro / Oscuro). Persists in
 * localStorage.tlt_theme; the pre-paint script in app/layout.tsx
 * applies the stored value on every load so dark users don't see a
 * light flash. Setting "system" wipes the key so the OS preference
 * takes over via the @media query in globals.css.
 */
export function ThemeToggle() {
  // Render a neutral pre-mount state to avoid hydration mismatches
  // (the server doesn't know what the client picked).
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem("tlt_theme") as Theme | null) ?? "system";
    setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    if (next === "system") {
      localStorage.removeItem("tlt_theme");
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem("tlt_theme", next);
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex rounded-md border border-border bg-card p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => apply(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
