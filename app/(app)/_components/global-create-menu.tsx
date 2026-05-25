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

/**
 * Global create entry. Renders the same "+ Nuevo" trigger and the
 * same dropdown of entity creation flows everywhere it mounts; the
 * canonical home is the top bar (right side), following the ATS /
 * CRM convention where create lives at the end of the chrome.
 *
 * Destinations:
 *  - /jobs/new            — dedicated full-page wizard
 *  - /candidates/import   — PDF/CSV import wizard (talent-pool flow)
 *  - /companies?create=1  — page-level URL-driven slot
 *  - /contacts?create=1   — page-level URL-driven slot
 *
 * Deals/Finanzas are hidden in the sidebar nav today; their create
 * entries are also commented out here to keep the menu coherent
 * with what's surfaced.
 */
export function GlobalCreateMenu({
  isAdmin = true,
}: {
  /**
   * Recruiters can't create vacantes (that'd let them grant
   * themselves access by being the assignee), so the "Nueva
   * vacante" item is admin-only. Other items stay available — any
   * authenticated user can land a candidate / company / contact in
   * the workspace. Defaults to true so callers that don't yet pass
   * the prop don't break.
   */
  isAdmin?: boolean;
} = {}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          aria-label="Crear"
          title="Crear"
          // Outline olive — matches the active-tab olive moment but
          // doesn't fill, so the top bar stays calm. Sits at h-9 to
          // line up with the search pill.
          className="flex h-9 items-center gap-1.5 rounded-md border border-accent px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Crear</span>
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          alignOffset={0}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 min-w-[200px] overflow-hidden rounded-md border border-border-1 bg-bg-1 p-1 text-sm shadow-dropdown"
        >
          {isAdmin ? (
            <Item
              href="/jobs?create=1"
              icon={<Briefcase className="h-3.5 w-3.5" />}
            >
              Nueva vacante
            </Item>
          ) : null}
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
