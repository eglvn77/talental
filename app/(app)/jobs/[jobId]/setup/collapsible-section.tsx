"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Card-style collapsible section. Header doubles as the toggle. Smooth
 * chevron rotation; content unmounts when collapsed to keep the DOM
 * light.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  rightSlot,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex flex-1 items-center justify-start gap-2 text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          {title}
        </button>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </header>
      {open ? <div className="border-t border-border px-4 py-4">{children}</div> : null}
    </section>
  );
}
