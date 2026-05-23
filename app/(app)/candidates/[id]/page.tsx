import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CandidateProfileBody } from "../candidate-profile-body";
import { loadCandidateProfile } from "../load-candidate-profile";

export const dynamic = "force-dynamic";

/**
 * Standalone talent-pool profile route for deep linking / sharing.
 *
 * The primary UX is the slideover that opens from /candidates via
 * `?candidate=<id>`. This page renders the same body content full-
 * width so a direct link to /candidates/[id] still works (e.g. when
 * copied from an email or another tool).
 */
export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await loadCandidateProfile(id);
  if (!bundle) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-4">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Candidatos
        </Link>
      </div>
      <CandidateProfileBody
        candidate={bundle.candidate}
        companiesById={bundle.companiesById}
        applications={bundle.applications}
      />
    </main>
  );
}
