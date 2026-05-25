"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { updateJobAction } from "../../../actions";

/**
 * Compact autosave form for the role's date + people fields. Used to
 * live (with a lot of company) inside OverviewEditor on the legacy
 * /overview tab; relocated here so Paquete can stay focused on the
 * dossier (requirements / sourcing / interview format) and Ajustes
 * gathers the workspace-level config + the few internal dates that
 * the recruiter sets once and rarely touches.
 *
 * Saves each field on blur / Enter; tiny inline spinner reflects the
 * in-flight write. Same pattern as the Publicación + Settings forms.
 */
export function RoleDatesForm({
  jobId,
  initial,
}: {
  jobId: string;
  initial: {
    open_date: string | null;
    target_start_date: string | null;
    hiring_manager_name: string | null;
    language_requirements: string | null;
  };
}) {
  const router = useRouter();
  const [openDate, setOpenDate] = useState(initial.open_date ?? "");
  const [targetStart, setTargetStart] = useState(
    initial.target_start_date ?? "",
  );
  const [hiringManager, setHiringManager] = useState(
    initial.hiring_manager_name ?? "",
  );
  const [langReq, setLangReq] = useState(initial.language_requirements ?? "");

  const lastOpen = useRef(initial.open_date ?? "");
  const lastTarget = useRef(initial.target_start_date ?? "");
  const lastManager = useRef(initial.hiring_manager_name ?? "");
  const lastLang = useRef(initial.language_requirements ?? "");

  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    setOpenDate(initial.open_date ?? "");
    setTargetStart(initial.target_start_date ?? "");
    setHiringManager(initial.hiring_manager_name ?? "");
    setLangReq(initial.language_requirements ?? "");
    lastOpen.current = initial.open_date ?? "";
    lastTarget.current = initial.target_start_date ?? "";
    lastManager.current = initial.hiring_manager_name ?? "";
    lastLang.current = initial.language_requirements ?? "";
  }, [initial]);

  async function commit(
    key: string,
    payload: Parameters<typeof updateJobAction>[0],
    onFail: () => void,
  ) {
    setSavingKey(key);
    const res = await updateJobAction(payload);
    setSavingKey((cur) => (cur === key ? null : cur));
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onFail();
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      <DateField
        label="Fecha de apertura"
        value={openDate}
        saving={savingKey === "open_date"}
        onChange={setOpenDate}
        onCommit={async () => {
          if (openDate === lastOpen.current) return;
          const prev = lastOpen.current;
          lastOpen.current = openDate;
          await commit(
            "open_date",
            { jobId, openDate: openDate || null },
            () => {
              setOpenDate(prev);
              lastOpen.current = prev;
            },
          );
        }}
      />
      <DateField
        label="Fecha de contratación deseada"
        value={targetStart}
        saving={savingKey === "target_start_date"}
        onChange={setTargetStart}
        onCommit={async () => {
          if (targetStart === lastTarget.current) return;
          const prev = lastTarget.current;
          lastTarget.current = targetStart;
          await commit(
            "target_start_date",
            { jobId, targetStartDate: targetStart || null },
            () => {
              setTargetStart(prev);
              lastTarget.current = prev;
            },
          );
        }}
      />
      <TextField
        label="Hiring manager"
        value={hiringManager}
        saving={savingKey === "hiring_manager_name"}
        onChange={setHiringManager}
        onCommit={async () => {
          const next = hiringManager.trim();
          if (next === lastManager.current) return;
          const prev = lastManager.current;
          lastManager.current = next;
          await commit(
            "hiring_manager_name",
            { jobId, hiringManagerName: next || null },
            () => {
              setHiringManager(prev);
              lastManager.current = prev;
            },
          );
        }}
      />
      <TextField
        label="Idiomas requeridos"
        value={langReq}
        saving={savingKey === "language_requirements"}
        onChange={setLangReq}
        onCommit={async () => {
          const next = langReq.trim();
          if (next === lastLang.current) return;
          const prev = lastLang.current;
          lastLang.current = next;
          await commit(
            "language_requirements",
            { jobId, languageRequirements: next || null },
            () => {
              setLangReq(prev);
              lastLang.current = prev;
            },
          );
        }}
        placeholder="Ej: Inglés C1, Español nativo"
      />
    </div>
  );
}

function DateField({
  label,
  value,
  saving,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  saving: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-2 text-xs font-medium">
        {label}
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : null}
      </span>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  saving,
  onChange,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  saving: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-2 text-xs font-medium">
        {label}
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : null}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
      />
    </label>
  );
}
