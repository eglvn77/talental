import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { loadCandidateView } from "../load-candidate-view";
import {
  CandidateProfileView,
  parseTab,
} from "../candidate-profile-view";

export const dynamic = "force-dynamic";

/**
 * Standalone full-page candidate profile for deep links / shares. The
 * primary in-app UX is the slideover that overlays /candidates; this
 * route renders the same content full-width so a copied link still
 * works.
 */
export default async function CandidateProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tab = parseTab((await searchParams).tab);
  const view = await loadCandidateView(id);
  if (!view) notFound();

  const me = await getCurrentUser();
  const userIsAdmin = me ? isAdmin(me.team_member) : false;
  const t = await getT();

  return (
    <CandidateProfileView
      view={view}
      tab={tab}
      mode="page"
      isAdmin={userIsAdmin}
      mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
      t={t}
    />
  );
}
