import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";

export default function CandidatesImportPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Candidatos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Importar candidatos</h1>
        <p className="text-sm text-muted-foreground">
          Sube un CSV con tus candidatos y mapea las columnas a los campos del
          ATS. Sin asociación a vacante por ahora — entran al talent pool.
        </p>
      </div>

      <ImportWizard />
    </main>
  );
}
