import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportTabs } from "./import-tabs";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CandidatesImportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // The CV review wizard reuses the jobs' Google Places autocomplete
  // for the candidate location field; pass the public key through.
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const sp = await searchParams;
  const t = await getT();
  // When the host pushes ?tab=csv (or ?tab=cv) the page is locked to
  // that method — show method-specific title + description so the copy
  // doesn't promise both. Without ?tab= we keep the generic intro.
  const lockedTab = sp.tab === "csv" || sp.tab === "cv" ? sp.tab : null;
  const title = lockedTab === "csv"
    ? t("candidatesArea.importCsvTitle")
    : lockedTab === "cv"
    ? t("candidatesArea.importCvTitle")
    : t("candidatesArea.importTitle");
  const intro = lockedTab === "csv"
    ? t("candidatesArea.importCsvIntro")
    : lockedTab === "cv"
    ? t("candidatesArea.importCvIntro")
    : t("candidatesArea.importIntro");
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
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>

      <ImportTabs mapsApiKey={mapsApiKey} />
    </main>
  );
}
