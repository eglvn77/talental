"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABEL } from "./config";
import { useLocale, useT } from "./client";
import { setLocaleAction } from "./actions";

/**
 * Language picker for the whole UI. Renders as a single "Language" row
 * that expands to reveal the locale options on click — keeps the
 * account dropdown short until the user actually wants to switch.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function pick(next: string) {
    if (next === locale || pending) return;
    start(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div className={cn("space-y-1", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg-1 transition-colors hover:bg-bg-3"
        aria-expanded={open}
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">{t("account.language")}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {LOCALE_LABEL[locale]}
        </span>
        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-0.5 pl-5">
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
              <span className="flex-1">{LOCALE_LABEL[loc]}</span>
              {loc === locale ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
