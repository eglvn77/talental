"use client";

import Link from "next/link";
import * as HoverCard from "@radix-ui/react-hover-card";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
/**
 * Shape the chip needs to render the hover popover + link. Lives
 * here (not on a page module) so any candidate-rendering view can
 * load companies once and pass a Map<id, CompanyChipData> down.
 */
export type CompanyChipData = {
  id: string;
  name: string;
  domain: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  size_range: string | null;
  hq_location: string | null;
  description: string | null;
  logo_url: string | null;
  employee_count: number | null;
  founded_year: number | null;
  company_type: string | null;
};

/**
 * Inline chip for a company referenced in a candidate's experience.
 *
 *   - With company_id: name renders as a Link with the relative
 *     `?company=X` query so the global slideover host (mounted in
 *     `(app)/layout.tsx`) opens the company profile in place without
 *     navigating away. A hover popover shows logo + industry + size +
 *     HQ + website.
 *   - Without company_id (enrichment failed or not run): falls back
 *     to plain text — visually indistinguishable from a regular span,
 *     no hover, no link. Keeps the experience row stable.
 */
export function CompanyChip({
  name,
  companyId,
  data,
}: {
  name: string;
  companyId?: string;
  data?: CompanyChipData;
}) {
  if (!companyId || !data) {
    return <span>{name}</span>;
  }
  return (
    <HoverCard.Root openDelay={200} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <Link
          href={`?company=${companyId}`}
          scroll={false}
          className="border-b border-dashed border-foreground/20 transition-colors hover:border-foreground/60 hover:text-foreground"
        >
          {name}
        </Link>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className={cn(
            "z-50 w-72 rounded-md border border-border bg-card p-3 text-sm shadow-modal outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <CompanyPopoverContent data={data} />
          <HoverCard.Arrow className="fill-border" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function CompanyPopoverContent({ data }: { data: CompanyChipData }) {
  const t = useT();
  const sizeLabel =
    data.employee_count && data.employee_count > 0
      ? t("shared.companyEmployees", {
          count: data.employee_count.toLocaleString("es-MX"),
        })
      : data.size_range
        ? t("shared.companyEmployees", { count: data.size_range })
        : null;

  return (
    <div className="space-y-2">
      <header className="flex items-start gap-2.5">
        {data.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.logo_url}
            alt={data.name}
            width={36}
            height={36}
            loading="lazy"
            className="h-9 w-9 shrink-0 rounded border border-border bg-card object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground"
          >
            <Building2 className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{data.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {data.industry ?? "—"}
          </div>
        </div>
      </header>

      {data.description ? (
        <p className="line-clamp-3 text-xs text-foreground/80">
          {data.description}
        </p>
      ) : null}

      <dl className="space-y-1 text-xs">
        {sizeLabel ? (
          <Row label={t("shared.companySize")} value={sizeLabel} />
        ) : null}
        {data.hq_location ? (
          <Row label={t("shared.companyHq")} value={data.hq_location} />
        ) : null}
        {data.founded_year ? (
          <Row
            label={t("shared.companyFounded")}
            value={String(data.founded_year)}
          />
        ) : null}
        {data.company_type ? (
          <Row label={t("shared.companyType")} value={data.company_type} />
        ) : null}
      </dl>

      {data.website_url || data.linkedin_url ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-2 text-[11px]">
          {data.website_url ? (
            <a
              href={data.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {t("shared.companyWebsite")}
            </a>
          ) : null}
          {data.linkedin_url ? (
            <a
              href={data.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              LinkedIn
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  );
}
