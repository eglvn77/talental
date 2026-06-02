"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { ArrowRightLeft, ExternalLink, History, Linkedin, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompanyRow, ContactRow } from "@/lib/hiring";
import { CompanyLogo } from "@/components/company-logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { deleteContactAction, updateContactAction } from "./actions";
import { convertContactToCandidateAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function ContactSlideover({
  contact,
  company,
  companies,
}: {
  contact: ContactRow;
  company: CompanyRow | null;
  companies: Array<{ id: string; name: string }>;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmConvert, setConfirmConvert] = useState(false);

  function convertToCandidate() {
    setError(null);
    startTransition(async () => {
      const res = await convertContactToCandidateAction({
        contactId: contact.id,
      });
      if (!res.ok) {
        const msg =
          res.error === "conflict"
            ? t("contactsArea.convertConflict")
            : res.error;
        toast.actionFailed(t("contactsArea.convertFailed"), msg);
        return;
      }
      toast.actionOk(t("contactsArea.convertedToCandidate"));
      setConfirmConvert(false);
      router.push(`/candidates/${res.data.candidateId}`);
    });
  }

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("contact");
    router.push(url.pathname + (url.search || ""), { scroll: false });
  }

  function patch(field: string, value: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await updateContactAction({
        contactId: contact.id,
        patch: { [field]: value },
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!confirm(t("contactsArea.confirmDelete", { name: contact.full_name }))) return;
    startTransition(async () => {
      const res = await deleteContactAction(contact.id);
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
              {contact.full_name}
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmConvert(true)}
                disabled={isPending}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("contactsArea.convertToCandidate")}
                aria-label={t("contactsArea.convertToCandidate")}
              >
                <ArrowRightLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                title={t("contactsArea.deleteContact")}
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

            {contact.linked_candidate_id ? (
              // The contact was promoted from the candidates pool —
              // surface a link back to the archived candidate row so
              // the user can see their application history.
              <Link
                href={`/candidates/${contact.linked_candidate_id}`}
                className="mb-4 flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft/40 px-3 py-2 text-xs text-foreground hover:bg-accent-soft/70"
              >
                <History className="h-3.5 w-3.5 text-accent" />
                <span>{t("contactsArea.previouslyCandidate")}</span>
                <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
              </Link>
            ) : null}

            <Field
              label={t("contactsArea.fieldName")}
              value={contact.full_name}
              onSave={(v) => patch("full_name", v.trim() || contact.full_name)}
            />
            <Field
              label={t("contactsArea.fieldTitle")}
              value={contact.title ?? ""}
              placeholder={t("contactsArea.titlePlaceholder")}
              onSave={(v) => patch("title", v || null)}
            />

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("contactsArea.fieldCompany")}
              </label>
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
                  value={contact.company_id ?? ""}
                  onChange={(v) => patch("company_id", v || null)}
                  disabled={isPending}
                  className="flex-1"
                  placeholder={t("contactsArea.noCompany")}
                  searchable={companies.length > 8}
                  options={[
                    { value: "", label: t("contactsArea.noCompany") },
                    ...companies.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                />
              </div>
            </div>

            <Field
              label={t("contactsArea.fieldEmail")}
              value={contact.email ?? ""}
              type="email"
              onSave={(v) => patch("email", v.trim().toLowerCase() || null)}
            />
            <Field
              label={t("contactsArea.fieldPhone")}
              value={contact.phone ?? ""}
              onSave={(v) => patch("phone", v.trim() || null)}
            />

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("contactsArea.fieldLinkedin")}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={contact.linkedin_url ?? ""}
                  placeholder="https://linkedin.com/in/…"
                  onBlur={(e) =>
                    patch("linkedin_url", e.target.value.trim() || null)
                  }
                  disabled={isPending}
                />
                {contact.linkedin_url ? (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t("contactsArea.openLinkedin")}
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>

            <Field
              label={t("contactsArea.fieldLocation")}
              value={contact.location ?? ""}
              placeholder={t("contactsArea.locationPlaceholder")}
              onSave={(v) => patch("location", v.trim() || null)}
            />

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("contactsArea.fieldNotes")}
              </label>
              <textarea
                defaultValue={contact.notes_summary ?? ""}
                placeholder={t("contactsArea.notesPlaceholder")}
                onBlur={(e) =>
                  patch("notes_summary", e.target.value.trim() || null)
                }
                disabled={isPending}
                rows={5}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      <ConfirmDialog
        open={confirmConvert}
        onOpenChange={setConfirmConvert}
        title={t("contactsArea.convertConfirmTitle", { name: contact.full_name })}
        description={t("contactsArea.convertConfirmDescription")}
        confirmLabel={t("contactsArea.convertConfirmLabel")}
        onConfirm={convertToCandidate}
      />
    </Dialog.Root>
  );
}

function Field({
  label,
  value,
  type = "text",
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.target.value !== value) onSave(e.target.value);
        }}
      />
    </div>
  );
}
