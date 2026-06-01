"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/client";
import { setLocaleAction } from "@/lib/i18n/actions";

/**
 * Compact language switcher for the public careers header. A small
 * globe + segmented ES/EN control; the active language is highlighted
 * so a visitor always sees which one is selected. Switching writes the
 * shared `locale` cookie and refreshes so the server + client tree
 * re-render in the chosen language.
 *
 * Self-contained: reads the active locale from <LocaleProvider> (added
 * in the careers layout) rather than a prop, so it can be dropped into
 * the server-rendered header without threading the value through.
 */
export function CareersLanguageToggle({ className }: { className?: string }) {
  const router = useRouter();
  const locale = useLocale();
  const [pending, start] = useTransition();

  function pick(next: string) {
    if (next === locale || pending) return;
    start(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-bg-1 px-1.5 py-1",
        className,
      )}
    >
      <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <div className="flex items-center">
        {LOCALES.map((loc) => {
          const active = loc === locale;
          return (
            <button
              key={loc}
              type="button"
              disabled={pending}
              onClick={() => pick(loc)}
              aria-pressed={active}
              title={LOCALE_LABEL[loc]}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide transition-colors disabled:opacity-60",
                active
                  ? "bg-accent text-fg-on-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {loc}
            </button>
          );
        })}
      </div>
    </div>
  );
}
