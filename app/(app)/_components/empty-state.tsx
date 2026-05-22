import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Standard empty-state card. Used by /jobs, /companies, /candidates
 * and the per-job tabs (Resumen, Requisitos, etc.) so the empty
 * experience is uniform across the product.
 */
export function EmptyState({
  title,
  description,
  action,
  variant = "card",
}: {
  title: string;
  description?: string;
  action?:
    | { label: string; href: string }
    | { label: string; onClick: () => void };
  /**
   * "card" — solid card with border, used at page level.
   * "dashed" — dashed outline, used inside tabs that already sit on a card.
   */
  variant?: "card" | "dashed";
}) {
  const wrapper =
    variant === "dashed"
      ? "mx-auto max-w-xl rounded-md border border-dashed border-border bg-card px-6 py-10 text-center"
      : "mx-auto max-w-xl rounded-md border border-border bg-card px-6 py-10 text-center";

  return (
    <div className={wrapper}>
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-4 inline-flex">
          {"href" in action ? (
            <Link
              href={action.href}
              className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
            >
              {action.label}
            </Link>
          ) : (
            <Button type="button" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
