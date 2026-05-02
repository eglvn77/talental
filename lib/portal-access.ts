import { getSupabaseAdmin, type CandidateCacheRow, type PortalLinkRow } from "./supabase";

export async function resolvePortalAndCandidate(
  slug: string,
  candidateSlug: string,
): Promise<
  | { ok: true; portal: PortalLinkRow; candidate: CandidateCacheRow }
  | { ok: false; status: 404 | 410 }
> {
  const supabase = getSupabaseAdmin();

  const { data: link } = await supabase
    .from("portal_links")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!link) return { ok: false, status: 404 };
  const portal = link as PortalLinkRow;

  if (!portal.is_active) return { ok: false, status: 410 };
  if (portal.expires_at && new Date(portal.expires_at) < new Date()) {
    return { ok: false, status: 410 };
  }

  const { data: cand } = await supabase
    .from("candidate_cache")
    .select("*")
    .eq("manatal_job_id", portal.manatal_job_id)
    .eq("candidate_slug", candidateSlug)
    .maybeSingle();
  if (!cand) return { ok: false, status: 404 };

  return { ok: true, portal, candidate: cand as CandidateCacheRow };
}
