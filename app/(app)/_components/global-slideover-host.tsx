"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  loadCompanyBundleAction,
  type CompanyBundle,
} from "../_actions/load-company-bundle";
import { CompanySlideover } from "../companies/company-slideover";

/**
 * App-wide slideover host. Mounted once at `(app)/layout.tsx` so any
 * route inside the authed area can surface the company profile via
 * `?company=<id>` without each page wiring its own server-side load.
 *
 * Flow:
 *   1. Reads `?company=<id>` from the URL.
 *   2. Calls a server action that returns the full bundle the existing
 *      `<CompanySlideover>` needs (company + roles + notes + custom
 *      fields).
 *   3. Renders the slideover. The slideover's own close handler strips
 *      the query param, so closing keeps the user exactly where they
 *      were (the user's reason for this whole refactor).
 *
 * Designed to grow: when we add candidate / contact / deal cross-page
 * slideovers, drop another bundle loader + branch below — the host
 * already lives in the right place.
 */
export function GlobalSlideoverHost() {
  const sp = useSearchParams();
  const pathname = usePathname() ?? "/";
  const companyId = sp?.get("company") ?? null;

  const [bundle, setBundle] = useState<CompanyBundle | null>(null);
  // Track the id we're loading so a fast click → close → click sequence
  // doesn't render a stale bundle from the previous load resolving
  // after the user already closed.
  const [loadingFor, setLoadingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setBundle(null);
      setLoadingFor(null);
      return;
    }
    // Same id, no-op — avoid refetching when other query params change
    // (filters, sort, etc).
    if (bundle?.company.id === companyId) return;

    setLoadingFor(companyId);
    let cancelled = false;
    loadCompanyBundleAction(companyId).then((b) => {
      if (cancelled) return;
      // Drop the result if the URL moved on while we were waiting.
      setLoadingFor((cur) => (cur === companyId ? null : cur));
      if (b && b.company.id === companyId) {
        setBundle(b);
      } else if (!b) {
        // Unknown / no-permission id — silently ignore.
        setBundle(null);
      }
    });
    return () => {
      cancelled = true;
    };
    // bundle?.company.id is intentionally omitted; we use the effect's
    // own setter to avoid double-fetching on the same id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Don't render anything while the URL has no slideover param.
  if (!companyId) return null;
  // While the first load is in flight (no bundle yet), render nothing
  // so we don't flash an empty shell. The transition is fast enough
  // that a skeleton would jitter more than it helps.
  if (!bundle || bundle.company.id !== companyId) return null;

  return (
    <CompanySlideover
      company={bundle.company}
      roles={bundle.roles}
      notes={bundle.notes}
      customFieldDefinitions={bundle.customFieldDefinitions}
      customFieldValues={bundle.customFieldValues}
      linkedContacts={bundle.linkedContacts}
      linkedDeals={bundle.linkedDeals}
      events={bundle.events}
      candidates={bundle.candidates}
      nav={bundle.nav}
      // Notes mutation revalidates the current route so the user sees
      // the new note immediately after returning to the page underneath.
      revalidatePath={pathname}
    />
  );
}
