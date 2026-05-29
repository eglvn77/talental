"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  COMPANY_STATUS_ORDER,
  type CompanyStatusDisplay,
} from "@/lib/company-status";
import type { CompanyStatus } from "@/lib/hiring";
import { updateCompanyStatusConfigAction } from "../../actions";

/**
 * Company-status editor. The four statuses (Cliente / Prospecto /
 * Aliado / Otra) are a fixed enum — they can't be added or deleted,
 * only renamed + recolored. That constraint is communicated with a
 * lock icon. Mirrors the JobStatusesList layout for visual parity.
 */
export function CompanyStatusesList({
  initial,
}: {
  initial: Record<CompanyStatus, CompanyStatusDisplay>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="hidden grid-cols-[1fr_88px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
        <span>Nombre</span>
        <span>Color</span>
      </div>
      <ul className="divide-y divide-border">
        {COMPANY_STATUS_ORDER.map((s) => (
          <Row key={s} status={s} display={initial[s]} />
        ))}
      </ul>
    </div>
  );
}

function Row({
  status,
  display,
}: {
  status: CompanyStatus;
  display: CompanyStatusDisplay;
}) {
  const router = useRouter();
  const [name, setName] = useState(display.label);
  useEffect(() => setName(display.label), [display.label]);
  const lastSaved = useRef(display.label);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(lastSaved.current);
      toast.actionFailed("El nombre no puede estar vacío");
      return;
    }
    if (trimmed === lastSaved.current) return;
    const res = await updateCompanyStatusConfigAction({ status, label: trimmed });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      setName(lastSaved.current);
      return;
    }
    lastSaved.current = trimmed;
    router.refresh();
  }

  async function commitColor(next: string) {
    const res = await updateCompanyStatusConfigAction({ status, color: next });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="grid grid-cols-[1fr_88px] items-center gap-2 bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: display.color }}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(lastSaved.current);
              (e.target as HTMLInputElement).blur();
            }
          }}
          maxLength={40}
          className="h-8 text-sm"
        />
        <span
          title="Estatus de sistema — solo se puede renombrar y cambiar de color"
          className="inline-flex shrink-0 items-center text-muted-foreground"
        >
          <Lock className="h-3 w-3" />
        </span>
      </div>
      <input
        type="color"
        value={display.color}
        onChange={(e) => void commitColor(e.target.value)}
        aria-label={`Color de ${display.label}`}
        className="h-7 w-12 cursor-pointer rounded-md border border-border bg-background p-0.5"
      />
    </li>
  );
}
