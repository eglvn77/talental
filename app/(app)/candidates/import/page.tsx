import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportTabs } from "./import-tabs";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CandidatesImportPage() {
  // The CV review wizard reuses the jobs' Google Places autocomplete
  // for the candidate location field; pass the public key through.
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          {t("candidatesArea.candidatesBack")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("candidatesArea.importTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("candidatesArea.importIntro")}
        </p>
      </div>

      <ImportTabs mapsApiKey={mapsApiKey} />
    </main>
  );
}
