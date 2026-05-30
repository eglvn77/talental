"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABEL } from "./config";
import { useLocale, useT } from "./client";
import { setLocaleAction } from "./actions";

/**
 * Language picker for the whole UI. Compact pill list — sits in the
 * account menu and in Ajustes. Switching writes the cookie + refreshes
 * so server + client components re-render in the chosen language.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [pending, start] = useTransition();

  function pick(next: string) {
    if (next === locale || pending) return;
    start(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div className={cn("space-y-1", className)}>
      {LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          disabled={pending}
          onClick={() => pick(loc)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-60",
            loc === locale
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{LOCALE_LABEL[loc]}</span>
          {loc === locale ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
        </button>
      ))}
      <p className="px-2 pt-1 text-[10px] text-muted-foreground">
        {t("account.language")}
      </p>
    </div>
  );
}
