import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { NewJobForm } from "./new-job-form";

export const dynamic = "force-dynamic";

export default function NewRolePage() {
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
          3 campos. La vacante nace en Borrador. Lo demás lo llenas después
          con Kickoff o en Ajustes.
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
