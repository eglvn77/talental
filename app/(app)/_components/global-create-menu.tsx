"use client";

import Link from "next/link";
import {
  BookUser,
  Briefcase,
  Building2,
  Plus,
  UserSearch,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Single, persistent create entry point in the sidebar. Replaces the
 * per-page "+ Nuevo X" buttons that used to live in every list-page
 * header. One button, one menu, every entity — keeps the chrome calm
 * and onboarding hint visible no matter what section the user is in.
 *
 * Destinations:
 *  - /jobs/new            — dedicated full-page wizard
 *  - /candidates/import   — PDF/CSV import wizard (the only candidate
 *                            creation flow we expose today)
 *  - /deals?create=1      — page-level URL-driven slot
 *  - /companies?create=1  — page-level URL-driven slot
 *  - /contacts?create=1   — page-level URL-driven slot
 *
 * The trio above (deals/companies/contacts) used to render an inline
 * form button in their page header. The form is still mounted at the
 * page level — it just listens to `?create=1` now so any caller can
 * pop it open.
 */
export function GlobalCreateMenu({ collapsed }: { collapsed: boolean }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          aria-label="Nuevo"
          title="Nuevo"
          className={cn(
            // Outline-olive treatment instead of a solid olive pill —
            // calmer top of the rail without losing the discoverability
            // of "Nuevo" being the first thing under the brand. The
            // single filled olive moment in this region is reserved
            // for the active nav tab below; the search bar (tinted
            // bone, not olive) keeps its prominence without competing
            // for the same color.
            "flex items-center rounded-md border border-accent font-medium text-accent transition-colors hover:bg-accent/10",
            collapsed
              ? // `mx-auto` centres the 32-px button in its flex-col
                // parent. Without it the button hugged the left edge
                // of the container (parent default `align-items` falls
                // back to `flex-start` once a child has a fixed width),
                // making the "+" read slightly off-centre against the
                // rest of the rail.
                "h-8 w-8 justify-center mx-auto"
              : "h-8 w-full justify-center gap-1.5 px-2.5 text-sm",
          )}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed ? "Nuevo" : null}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="start"
          side="right"
          sideOffset={8}
          className="z-50 min-w-[200px] overflow-hidden rounded-md border border-border-1 bg-bg-1 p-1 text-sm shadow-dropdown"
        >
          <Item href="/jobs/new" icon={<Briefcase className="h-3.5 w-3.5" />}>
            Nueva vacante
          </Item>
          <Item
            href="/candidates/import"
            icon={<UserSearch className="h-3.5 w-3.5" />}
          >
            Nuevo candidato
          </Item>
          {/* "Nuevo deal" is hidden together with the CRM tab — re-
              add it when /deals goes back into the sidebar. */}
          <Item
            href="/companies?create=1"
            icon={<Building2 className="h-3.5 w-3.5" />}
          >
            Nueva empresa
          </Item>
          <Item
            href="/contacts?create=1"
            icon={<BookUser className="h-3.5 w-3.5" />}
          >
            Nuevo contacto
          </Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function Item({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dropdown.Item asChild>
      <Link
        href={href}
        className="flex items-center gap-2 rounded px-2 py-1.5 text-fg-1 outline-none hover:bg-bg-3 focus:bg-bg-3"
      >
        {icon}
        {children}
      </Link>
    </Dropdown.Item>
  );
}
