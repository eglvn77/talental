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

  // Version history — fed by the prompts_snapshot_version trigger.
  // Pull the team_member full_name for each editor so the timeline
  // shows who made each change without an extra round-trip.
  const { data: versionRows } = await db
    .from("prompt_versions")
    .select(
      "id, version_number, body, model, edited_by_team_member_id, created_at, editor:team_members!prompt_versions_edited_by_team_member_id_fkey(full_name)",
    )
    .eq("prompt_id", prompt.id)
    .order("version_number", { ascending: false });
  const versions = ((versionRows ?? []) as Array<{
    id: string;
    version_number: number;
    body: string;
    model: string;
    edited_by_team_member_id: string | null;
    created_at: string;
    editor: { full_name: string | null } | { full_name: string | null }[] | null;
  }>).map((v) => {
    const editor = Array.isArray(v.editor) ? v.editor[0] : v.editor;
    return {
      id: v.id,
      version_number: v.version_number,
      body: v.body,
      model: v.model,
      edited_by_team_member_id: v.edited_by_team_member_id,
      edited_by_name: editor?.full_name ?? null,
      created_at: v.created_at,
    };
  });

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
        <PromptEditor prompt={prompt} versions={versions} />
      </section>
    </>
  );
}
