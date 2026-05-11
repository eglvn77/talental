import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { NewJobForm } from "./new-job-form";

export const dynamic = "force-dynamic";

export default async function NewRolePage() {
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
          Elige un cliente (o crea uno al vuelo) y llena los datos básicos.
        </p>
      </div>

      <Card>
        <CardContent>
          <NewJobForm mapsApiKey={apiKey} />
        </CardContent>
      </Card>
    </main>
  );
}
