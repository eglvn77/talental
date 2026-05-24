import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { NewJobForm } from "./new-job-form";

export const dynamic = "force-dynamic";

/**
 * /jobs/new — open a vacante.
 *
 * The fee-terms block fetches contacts / companies on demand from
 * the comboboxes themselves, so this page doesn't pre-load any of
 * those directories. Keeps the first paint snappy.
 */
export default function NewRolePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/jobs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a vacantes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Nueva vacante</h1>
        <p className="text-sm text-muted-foreground">
          Captura los términos comerciales al abrir. Se puede editar
          después en Ajustes o autocompletar con Kickoff.
        </p>
      </div>

      <Card>
        <CardContent>
          <NewJobForm />
        </CardContent>
      </Card>
    </main>
  );
}
