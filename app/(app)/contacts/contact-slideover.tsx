"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, Linkedin, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompanyRow, ContactRow } from "@/lib/hiring";
import { CompanyLogo } from "@/components/company-logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { deleteContactAction, updateContactAction } from "./actions";

export function ContactSlideover({
  contact,
  company,
  companies,
}: {
  contact: ContactRow;
  company: CompanyRow | null;
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm(`¿Eliminar a ${contact.full_name}?`)) return;
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
                onClick={remove}
                disabled={isPending}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                title="Eliminar contacto"
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

            <Field
              label="Nombre"
              value={contact.full_name}
              onSave={(v) => patch("full_name", v.trim() || contact.full_name)}
            />
            <Field
              label="Puesto"
              value={contact.title ?? ""}
              placeholder="Ej. Director de talento"
              onSave={(v) => patch("title", v || null)}
            />

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Empresa
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
                <select
                  defaultValue={contact.company_id ?? ""}
                  onChange={(e) => patch("company_id", e.target.value || null)}
                  disabled={isPending}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Sin empresa</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Field
              label="Email"
              value={contact.email ?? ""}
              type="email"
              onSave={(v) => patch("email", v.trim().toLowerCase() || null)}
            />
            <Field
              label="Teléfono"
              value={contact.phone ?? ""}
              onSave={(v) => patch("phone", v.trim() || null)}
            />

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                LinkedIn
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
                    title="Abrir LinkedIn"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>

            <Field
              label="Ubicación"
              value={contact.location ?? ""}
              placeholder="Ciudad, País"
              onSave={(v) => patch("location", v.trim() || null)}
            />

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Notas
              </label>
              <textarea
                defaultValue={contact.notes_summary ?? ""}
                placeholder="Contexto, próximos pasos, intereses…"
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
