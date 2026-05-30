"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type {
  CompanyRow,
  ContactRow,
  DealRow,
  DealStage,
} from "@/lib/hiring";
import { CompanyLogo } from "@/components/company-logo";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { deleteDealAction, updateDealAction } from "./actions";

const STAGES: ReadonlyArray<{ key: DealStage; labelKey: string }> = [
  { key: "lead", labelKey: "crm.stageLead" },
  { key: "qualified", labelKey: "crm.stageQualified" },
  { key: "proposal", labelKey: "crm.stageProposal" },
  { key: "negotiation", labelKey: "crm.stageNegotiation" },
  { key: "won", labelKey: "crm.stageWon" },
  { key: "lost", labelKey: "crm.stageLost" },
];

export function DealSlideover({
  deal,
  company,
  contact,
  companies,
  contacts,
}: {
  deal: DealRow;
  company: CompanyRow | null;
  contact: ContactRow | null;
  companies: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; full_name: string }>;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("deal");
    router.push(url.pathname + (url.search || ""), { scroll: false });
  }

  function patch(field: string, value: unknown) {
    setError(null);
    startTransition(async () => {
      const res = await updateDealAction({
        dealId: deal.id,
        patch: { [field]: value } as Parameters<
          typeof updateDealAction
        >[0]["patch"],
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!confirm(t("crm.deleteDealConfirm", { title: deal.title }))) return;
    startTransition(async () => {
      const res = await deleteDealAction(deal.id);
      if (!res.ok) setError(res.error);
      else {
        close();
        router.refresh();
      }
    });
  }

  return (
    <Dialog.Root open onOpenChange={(o) => (!o ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-modal",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              {deal.title}
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                title={t("crm.deleteDeal")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 text-sm">
            {error ? (
              <p className="mb-3 rounded border border-danger-soft bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            ) : null}

            <Row label={t("crm.fieldTitle")}>
              <Input
                defaultValue={deal.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== deal.title) patch("title", v);
                }}
              />
            </Row>

            <Row label={t("crm.fieldStage")}>
              <Select
                value={deal.stage}
                onChange={(v) => patch("stage", v as DealStage)}
                disabled={isPending}
                options={STAGES.map((s) => ({
                  value: s.key,
                  label: t(s.labelKey),
                }))}
              />
            </Row>

            <Row label={t("crm.fieldCompany")}>
              <div className="flex items-center gap-2">
                {company ? (
                  <CompanyLogo
                    src={company.logo_url}
                    domain={company.domain}
                    name={company.name}
                    size="sm"
                  />
                ) : null}
                <Select
                  value={deal.company_id ?? ""}
                  onChange={(v) => patch("company_id", v || null)}
                  disabled={isPending}
                  className="flex-1"
                  placeholder={t("crm.noCompany")}
                  searchable={companies.length > 8}
                  options={[
                    { value: "", label: t("crm.noCompany") },
                    ...companies.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                />
              </div>
            </Row>

            <Row label={t("crm.fieldPrimaryContact")}>
              <Select
                value={deal.primary_contact_id ?? ""}
                onChange={(v) => patch("primary_contact_id", v || null)}
                disabled={isPending}
                placeholder={t("crm.noContact")}
                searchable={contacts.length > 8}
                options={[
                  { value: "", label: t("crm.noContact") },
                  ...contacts.map((c) => ({
                    value: c.id,
                    label: c.full_name ?? t("crm.noName"),
                  })),
                ]}
              />
            </Row>
            {contact ? (
              <p className="-mt-3 mb-4 text-[10px] text-muted-foreground">
                {[contact.title, contact.email].filter(Boolean).join(" · ")}
              </p>
            ) : null}

            <Row label={t("crm.fieldAmount")}>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={deal.value_amount ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    const num = v === "" ? null : Number(v);
                    if (num === null || Number.isFinite(num)) {
                      patch("value_amount", num);
                    }
                  }}
                  className="flex-1"
                />
                <Select
                  value={deal.value_currency ?? "MXN"}
                  onChange={(v) => patch("value_currency", v)}
                  disabled={isPending}
                  className="w-28"
                  options={[
                    { value: "MXN", label: "MXN" },
                    { value: "USD", label: "USD" },
                    { value: "EUR", label: "EUR" },
                  ]}
                />
              </div>
            </Row>

            <Row label={t("crm.fieldExpectedClose")}>
              <Input
                type="date"
                defaultValue={deal.expected_close_date ?? ""}
                onBlur={(e) =>
                  patch("expected_close_date", e.target.value || null)
                }
              />
            </Row>

            <Row label={t("crm.fieldDescription")}>
              <textarea
                defaultValue={deal.description ?? ""}
                onBlur={(e) =>
                  patch("description", e.target.value.trim() || null)
                }
                disabled={isPending}
                rows={5}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Row>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
