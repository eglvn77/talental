"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/**
 * Right-side slideover that overlays the talent-pool table. Mounted by
 * /candidates whenever `?candidate=<id>` is present. Closing drops the
 * query params and returns to /candidates — the table stays mounted
 * behind it the whole time (the underlying route never changes).
 *
 * The rich profile content is rendered server-side and passed as
 * `children`; this shell only owns the dialog chrome + close behavior.
 */
export function CandidateSlideoverShell({
  candidateName,
  children,
}: {
  candidateName: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  // Local open state so the dialog closes IMMEDIATELY on click-outside /
  // Esc / X — instead of depending on the route change to unmount it.
  // Previously `open` was hard-coded true, so if the router.push that
  // drops ?candidate was slow or a no-op the panel stayed stuck open.
  const [open, setOpen] = useState(true);
  function close() {
    setOpen(false);
    // Drop the panel params, preserve everything else on whatever route
    // the panel is overlaying (/candidates, a job board, etc.).
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.delete("candidate");
    sp.delete("tab");
    sp.delete("app");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (!o ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-5xl flex-col overflow-y-auto border-l border-border bg-bg-1 shadow-modal",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          )}
        >
          <Dialog.Title className="sr-only">
            {t("candidatesArea.profileTitle", { name: candidateName })}
          </Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
