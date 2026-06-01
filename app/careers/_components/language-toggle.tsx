"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/client";
import { setLocaleAction } from "@/lib/i18n/actions";

/**
 * Language switcher for the public careers header. A single button that
 * shows the current language (globe + code); clicking it reveals the
 * available languages in a dropdown. Switching writes the shared
 * `locale` cookie and refreshes so the tree re-renders in the choice.
 *
 * Self-contained: reads the active locale from <LocaleProvider> (added
 * in the careers layout) rather than a prop.
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={LOCALE_LABEL[locale]}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-bg-1 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60",
            className,
          )}
        >
          <Globe className="h-3.5 w-3.5" aria-hidden />
          {locale}
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        {LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => pick(loc)}
            className="flex items-center justify-between gap-3"
          >
            {LOCALE_LABEL[loc]}
            {loc === locale ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
