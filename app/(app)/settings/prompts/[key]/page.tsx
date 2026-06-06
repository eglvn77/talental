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
  // Fetched as two queries instead of an embedded resource so the
  // editor's name being unresolvable can never silently null out the
  // version rows themselves (an earlier missing FK had exactly that
  // failure mode and hid every saved version from the UI).
  const { data: versionRowsRaw } = await db
    .from("prompt_versions")
    .select(
      "id, version_number, body, model, edited_by_team_member_id, created_at",
    )
    .eq("prompt_id", prompt.id)
    .order("version_number", { ascending: false });
  const versionRows = (versionRowsRaw ?? []) as Array<{
    id: string;
    version_number: number;
    body: string;
    model: string;
    edited_by_team_member_id: string | null;
    created_at: string;
  }>;
  const editorIds = Array.from(
    new Set(
      versionRows
        .map((v) => v.edited_by_team_member_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const editorNameById: Record<string, string> = {};
  if (editorIds.length > 0) {
    const { data: editorRows } = await db
      .from("team_members")
      .select("id, full_name")
      .in("id", editorIds);
    for (const e of (editorRows ?? []) as Array<{
      id: string;
      full_name: string | null;
    }>) {
      editorNameById[e.id] = e.full_name ?? "";
    }
  }
  const versions = versionRows.map((v) => ({
    id: v.id,
    version_number: v.version_number,
    body: v.body,
    model: v.model,
    edited_by_team_member_id: v.edited_by_team_member_id,
    edited_by_name: v.edited_by_team_member_id
      ? editorNameById[v.edited_by_team_member_id] ?? null
      : null,
    created_at: v.created_at,
  }));

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
