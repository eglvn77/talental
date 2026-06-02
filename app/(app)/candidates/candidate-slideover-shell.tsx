"use client";

import { useRouter } from "next/navigation";
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
  const t = useT();
  function close() {
    router.push("/candidates", { scroll: false });
  }
  return (
    <Dialog.Root open onOpenChange={(o) => (!o ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-border bg-bg-1 shadow-modal",
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
