"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { updateWorkspaceNameAction } from "../actions";

/**
 * Inline editable workspace name. Autosaves on blur + Enter. Lives at
 * the top of the Equipo tab — the workspace's identity is part of
 * "your team's settings" so it sits next to the members list rather
 * than in its own page.
 *
 * Admin-gated server-side via updateWorkspaceNameAction. Recruiters
 * never reach this surface (the Equipo tab is admin-only).
 */
export function WorkspaceNameField({ initialName }: { initialName: string }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const last = useRef(initialName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(initialName);
    last.current = initialName;
  }, [initialName]);

  async function commit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(last.current);
      toast.actionFailed(t("team.nameEmptyError"));
      return;
    }
    if (trimmed === last.current) return;
    setSaving(true);
    const res = await updateWorkspaceNameAction({ name: trimmed });
    setSaving(false);
    if (!res.ok) {
      toast.actionFailed(t("team.saveFailed"), res.error);
      setName(last.current);
      return;
    }
    last.current = trimmed;
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor="ws-name" className="text-xs font-medium">
          {t("team.teamNameLabel")}
        </label>
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <Input
        id="ws-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setName(last.current);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="max-w-md"
      />
    </div>
  );
}
