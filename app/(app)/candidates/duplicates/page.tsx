import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { findCandidateDuplicatesAction } from "../../_actions/candidate-merge";
import { EmptyState } from "../../_components/empty-state";
import { DuplicatesReview } from "./duplicates-review";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Candidate de-duplication review. Lists likely-duplicate groups
 * (same normalized name) and lets an admin fold two into one with a
 * field-by-field merge. Admin-only.
 */
export default async function CandidateDuplicatesPage() {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/candidates");

  const res = await findCandidateDuplicatesAction();
  const groups = res.ok ? res.data.groups : [];
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-[1000px] px-6 py-10">
      <div className="mb-1">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("candidatesArea.candidatesBack")}
        </Link>
      </div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">{t("candidatesArea.duplicatesTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("candidatesArea.duplicatesIntro")}
        </p>
      </div>

      {!res.ok ? (
        <p className="mb-3 text-sm text-danger">
          {t("candidatesArea.loadFailed", { error: res.error })}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          title={t("candidatesArea.noDuplicatesTitle")}
          description={t("candidatesArea.noDuplicatesDesc")}
        />
      ) : (
        <DuplicatesReview groups={groups} />
      )}
    </main>
  );
}
