"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { setDefaultPromptAction } from "../actions";

/** Marks a prompt as its category's default. Shown only on non-default
 *  prompts; the active default renders a static "Default" badge. */
export function SetDefaultButton({ promptId }: { promptId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const res = await setDefaultPromptAction({ promptId });
          if (!res.ok) {
            toast.actionFailed(t("promptsCfg.setDefaultFailed"), res.error);
            return;
          }
          toast.actionOk(t("promptsCfg.setDefaultOk"));
          router.refresh();
        });
      }}
      title={t("promptsCfg.setDefaultTitle")}
      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <Star className="h-3 w-3" />
      {t("promptsCfg.setDefaultButton")}
    </button>
  );
}
