"use client";

import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { useT } from "@/lib/i18n/client";
import { setLocaleAction } from "@/lib/i18n/actions";

export function PortalHeader({
  slug,
  companyName,
  companyLogoUrl,
  jobTitle,
  showBackLink,
}: {
  slug: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  jobTitle?: string;
  showBackLink?: boolean;
}) {
  const t = useT();
  async function pickLocale(loc: "es" | "en") {
    await setLocaleAction(loc);
  }
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-6 py-3">
        <CompanyLogo
          src={companyLogoUrl}
          domain={null}
          name={companyName ?? "Talental"}
          size="md"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {companyName ?? "—"}
          </p>
          {jobTitle ? (
            <p className="truncate text-xs text-muted-foreground">
              {jobTitle}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {showBackLink ? (
            <Link
              href={`/portal/${slug}`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← {t("portal.backToJobs")}
            </Link>
          ) : null}
          <div className="flex items-center gap-0.5 rounded border border-border bg-bg-2 p-0.5 text-[10px] font-medium">
            <button
              type="button"
              onClick={() => pickLocale("es")}
              className="rounded px-1.5 py-0.5 hover:bg-muted"
              aria-label="Español"
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => pickLocale("en")}
              className="rounded px-1.5 py-0.5 hover:bg-muted"
              aria-label="English"
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
