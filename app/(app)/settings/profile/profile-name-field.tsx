"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { updateMyProfileAction } from "../actions";

/**
 * Inline editable display name for the current user. Autosaves on
 * blur + Enter. RLS on team_members already restricts the underlying
 * update to `auth_user_id = auth.uid()` so we don't need an extra
 * server-side authz gate.
 */
export function ProfileNameField({
  initialName,
}: {
  initialName: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const last = useRef(initialName ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(initialName ?? "");
    last.current = initialName ?? "";
  }, [initialName]);

  async function commit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(last.current);
      toast.actionFailed("El nombre no puede estar vacío");
      return;
    }
    if (trimmed === last.current) return;
    setSaving(true);
    const res = await updateMyProfileAction({ fullName: trimmed });
    setSaving(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      setName(last.current);
      return;
    }
    last.current = trimmed;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Input
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
        placeholder="Tu nombre"
      />
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
