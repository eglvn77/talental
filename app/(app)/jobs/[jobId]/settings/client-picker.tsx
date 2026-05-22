"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CompanyCombobox } from "@/app/(app)/jobs/new/company-combobox";
import { updateJobAction } from "@/app/(app)/actions";
import type { CompanyStatus } from "@/lib/hiring";

export function ClientPicker({
  jobId,
  initial,
}: {
  jobId: string;
  initial: {
    id: string;
    name: string;
    domain: string | null;
    logo_url: string | null;
    status: CompanyStatus;
  } | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function onChange(c: { id: string } | null) {
    if (!c) return;
    if (c.id === initial?.id) return;
    startTransition(async () => {
      const res = await updateJobAction({ jobId, companyId: c.id });
      if (!res.ok) {
        toast.error("No se pudo cambiar el cliente", { description: res.error });
        return;
      }
      toast.success("Cliente actualizado");
      router.refresh();
    });
  }

  return <CompanyCombobox defaultCompany={initial} onChange={onChange} />;
}
