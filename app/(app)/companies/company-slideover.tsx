"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, X } from "lucide-react";
import {
  type CompanyRow,
  type CompanyStatus,
  type CustomFieldDefinitionRow,
  type NoteRow,
  type JobRow,
} from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { formatSalaryRange } from "@/lib/format";
import { JOB_STATUS_LABEL, JOB_STATUS_TONE } from "@/lib/job-status";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { updateCompanyStatusAction } from "../actions";
import { CompanyNotes } from "./company-notes";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";

const STATUSES: CompanyStatus[] = ["prospect", "client", "partner", "none"];

const STATUS_ES: Record<CompanyStatus, string> = {
  prospect: "Prospecto",
  client: "Cliente",
  partner: "Aliado",
  none: "Otra",
};

// Distillate token mapping for the per-status indicator bar under the
// company status select. Mirrors the <Pill> tones used in the table.
const STATUS_BAR_CLASS: Record<CompanyStatus, string> = {
  client: "bg-positive",
  prospect: "bg-warning",
  partner: "bg-accent",
  none: "bg-fg-muted",
};

export function CompanySlideover({
  company,
  roles,
  notes,
  customFieldDefinitions,
  customFieldValues,
  revalidatePath,
}: {
  company: CompanyRow;
  roles: JobRow[];
  notes: NoteRow[];
  customFieldDefinitions: CustomFieldDefinitionRow[];
  customFieldValues: Record<string, unknown>;
  revalidatePath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("company");
    router.push(url.pathname + (url.search || ""), { scroll: false });
  }

  function changeStatus(s: CompanyStatus) {
    startTransition(async () => {
      const res = await updateCompanyStatusAction(company.id, s);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Dialog.Root open onOpenChange={(o) => (!o ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-modal",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-3 text-sm">
              <Dialog.Title className="text-base font-semibold">
                {company.name}
              </Dialog.Title>
              {company.domain ? (
                <a
                  href={company.website_url ?? `https://${company.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {company.domain}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Cerrar"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            Detalles de la empresa, vacantes vinculadas y notas
          </Dialog.Description>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              <Section label="Descripción">
                {company.description ? (
                  <p className="whitespace-pre-wrap text-sm">
                    {company.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin descripción.</p>
                )}
              </Section>

              <Section label={`Vacantes · ${roles.length}`}>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Esta empresa aún no tiene vacantes.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {roles.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/jobs/${r.id}`}
                          className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.title}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[
                                r.location,
                                formatSalaryRange(
                                  r.salary_min,
                                  r.salary_max,
                                  r.salary_currency,
                                  r.salary_type,
                                  r.salary_frequency,
                                ),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </div>
                          </div>
                          <Pill tone={JOB_STATUS_TONE[r.status]}>
                            {JOB_STATUS_LABEL[r.status]}
                          </Pill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {customFieldDefinitions.length > 0 ? (
                <Section label="Campos personalizados">
                  <CustomFieldsBlock
                    entityId={company.id}
                    definitions={customFieldDefinitions}
                    initialValues={customFieldValues}
                  />
                </Section>
              ) : null}

              <Section label="Notas">
                <CompanyNotes
                  companyId={company.id}
                  notes={notes}
                  revalidatePath={revalidatePath}
                />
              </Section>
            </div>

            <aside className="w-72 shrink-0 border-l border-border bg-muted/20 p-5 text-sm">
              <Field label="Estado">
                <Select
                  value={company.status}
                  onChange={(v) => changeStatus(v as CompanyStatus)}
                  disabled={isPending}
                  options={STATUSES.map((s) => ({
                    value: s,
                    label: STATUS_ES[s],
                  }))}
                />
                <span
                  className={`mt-1 inline-block h-1.5 w-full rounded ${STATUS_BAR_CLASS[company.status]}`}
                />
              </Field>
              <Field label="Industria">
                {company.industry ?? <Empty />}
              </Field>
              <Field label="Tamaño">
                {company.size_range ?? <Empty />}
              </Field>
              <Field label="Sede">
                {company.hq_location ?? <Empty />}
              </Field>
              <Field label="LinkedIn">
                {company.linkedin_url ? (
                  <a
                    href={company.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    Perfil <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <Empty />
                )}
              </Field>
              <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
                <div>
                  Creada {new Date(company.created_at).toLocaleDateString("es-MX")}
                </div>
                <div>
                  Actualizada {new Date(company.updated_at).toLocaleDateString("es-MX")}
                </div>
              </div>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-md border border-border bg-card p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Empty() {
  return <span className="italic text-muted-foreground">Sin definir</span>;
}
