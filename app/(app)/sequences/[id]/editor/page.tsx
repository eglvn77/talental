import { notFound } from "next/navigation";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { STEP_SELECT } from "@/lib/sequences/engine";
import { SequenceEditor, type EditorStep } from "../../_components/editor/sequence-editor";

export const dynamic = "force-dynamic";

export default async function SequenceEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: seq } = await db
    .from("sequences")
    .select("id, name, status, workspace_id, settings")
    .eq("id", id)
    .maybeSingle();
  if (!seq || (seq.workspace_id as string) !== workspaceId) notFound();

  const [{ data: steps }, { count: enrollments }, { data: accounts }, { data: templates }, { data: customFields }] =
    await Promise.all([
      db
        .from("sequence_steps")
        .select(STEP_SELECT)
        .eq("sequence_id", id)
        .order("position", { ascending: true }),
      db
        .from("sequence_enrollments")
        .select("id", { head: true, count: "exact" })
        .eq("sequence_id", id),
      db
        .from("connected_accounts")
        .select("id, provider, status, account_metadata")
        .eq("workspace_id", workspaceId),
      db
        .from("message_templates")
        .select("id, name, subject, content")
        .eq("workspace_id", workspaceId)
        .order("position", { ascending: true }),
      db
        .from("custom_field_definitions")
        .select("key, label, entity_type")
        .eq("workspace_id", workspaceId),
    ]);

  return (
    <SequenceEditor
      sequence={{
        id,
        name: seq.name as string,
        status: seq.status as string,
        mode:
          (((seq.settings as Record<string, unknown> | null)?.mode as string) ?? "simple") ===
          "advanced"
            ? "advanced"
            : "simple",
      }}
      steps={(steps ?? []) as unknown as EditorStep[]}
      hasEnrollments={(enrollments ?? 0) > 0}
      accounts={(accounts ?? []).map((a) => ({
        id: a.id as string,
        provider: a.provider as string,
        status: a.status as string,
        label:
          (((a.account_metadata as Record<string, unknown> | null)?.email as string) ??
            ((a.account_metadata as Record<string, unknown> | null)?.public_id as string) ??
            (a.provider as string)) || (a.provider as string),
      }))}
      templates={(templates ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        subject: (t.subject as string | null) ?? null,
        content: t.content as string,
      }))}
      customVariables={(customFields ?? [])
        .filter((f) => f.entity_type === "candidate")
        .map((f) => ({ key: f.key as string, label: f.label as string }))}
    />
  );
}
