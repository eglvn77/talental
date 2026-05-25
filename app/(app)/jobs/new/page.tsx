import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { hiring } from "@/lib/hiring";
import { NewJobForm, type ProcessTemplateOption } from "./new-job-form";

export const dynamic = "force-dynamic";

/**
 * /jobs/new — open a vacante.
 *
 * Captures just enough to start a pipeline: title, company,
 * location, and which process template's stages get seeded into the
 * new vacante's pipeline. Fee terms moved to their own admin-only
 * tab inside the vacante (`/jobs/[jobId]/terms`) so this surface
 * stays light for the everyday case.
 */
export default async function NewRolePage() {
  const db = await hiring();
  const { data } = await db
    .from("process_templates")
    .select("id, name, is_default")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  const templates: ProcessTemplateOption[] = (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    is_default: Boolean(t.is_default),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/jobs"
          aria-label="Volver a vacantes"
          title="Volver a vacantes"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Nueva vacante</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Captura lo mínimo para arrancar — los términos comerciales se
          configuran después en el tab Términos.
        </p>
      </div>

      <Card>
        <CardContent>
          <NewJobForm templates={templates} />
        </CardContent>
      </Card>
    </main>
  );
}
