import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { hiring, type PromptRow } from "@/lib/hiring";
import { ensurePromptAction } from "../../actions";
import { SettingsTabsServer } from "../../_components/settings-tabs-server";
import { PromptEditor } from "./prompt-editor";

export const dynamic = "force-dynamic";

/** Keys that auto-seed from PROMPT_DEFAULTS if missing. Others must
 *  already exist in the table (created via the "New prompt" dialog). */
const SEEDABLE_KEYS = ["kickoff_master"];

export default async function PromptEditPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const t = await getT();
  const me = await getCurrentUser();
  if (!me || me.team_member.team_role !== "owner") notFound();

  if (SEEDABLE_KEYS.includes(key)) {
    await ensurePromptAction(key);
  }

  const db = await hiring();
  const { data } = await db
    .from("prompts")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (!data) notFound();
  const prompt = data as PromptRow;

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-4">
        <div className="text-xs">
        <Link
          href="/settings/prompts"
          className="text-muted-foreground hover:text-foreground"
        >
          ← {t("promptsCfg.backToPrompts")}
        </Link>
      </div>
      <div>
        <h2 className="text-lg font-semibold">{prompt.label}</h2>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{prompt.key}</span>
        </p>
      </div>
        <PromptEditor prompt={prompt} />
      </section>
    </>
  );
}
