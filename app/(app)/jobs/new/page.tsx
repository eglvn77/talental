import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createJobAndRedirect } from "../../actions";
import { CompanyCombobox } from "./company-combobox";
import { LocationAutocomplete } from "./location-autocomplete";
import { NumberInputWithCommas } from "./number-input";

export const dynamic = "force-dynamic";

export default async function NewRolePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/jobs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a vacantes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Nueva vacante</h1>
        <p className="text-sm text-muted-foreground">
          Elige una empresa (o crea una al vuelo) y llena los datos básicos.
        </p>
      </div>

      {params.error ? (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="text-sm text-red-700">
            {params.error}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <form action={createJobAndRedirect} className="space-y-5">
            <Field label="Empresa" required>
              <CompanyCombobox />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Correo de contacto">
                <Input name="contact_email" type="email" />
              </Field>
              <Field label="Nombre de contacto">
                <Input name="contact_name" />
              </Field>
            </div>

            <div className="border-t border-border pt-4">
              <Field label="Título de la vacante" required>
                <Input name="title" required />
              </Field>
            </div>

            <Field label="Ubicación">
              <LocationAutocomplete apiKey={apiKey} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Salario mín. (MXN)">
                <NumberInputWithCommas name="salary_min" placeholder="50,000" />
              </Field>
              <Field label="Salario máx. (MXN)">
                <NumberInputWithCommas name="salary_max" placeholder="80,000" />
              </Field>
            </div>

            <Field label="Descripción pública (visible a los candidatos)">
              <textarea
                name="public_description"
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit">Crear vacante</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
