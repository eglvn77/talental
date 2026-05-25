import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  hiring,
  type ProcessTemplateRow,
  type ProcessTemplateStageRow,
} from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { StagesEditor } from "../_components/stages-editor";
import { TemplateSettingsForm } from "../_components/template-settings-form";

export const dynamic = "force-dynamic";

export default async function ProcessTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");

  const { id } = await params;
  const db = await hiring();

  // Fetch the template, its stages, and the workspace's template count
  // (so we know whether to lock the "default" toggle) in parallel.
  // RLS scopes everything to the current workspace.
  const [tplRes, stagesRes, countRes] = await Promise.all([
    db.from("process_templates").select("*").eq("id", id).maybeSingle(),
    db
      .from("process_template_stages")
      .select("*")
      .eq("template_id", id)
      .order("position", { ascending: true }),
    db
      .from("process_templates")
      .select("id", { count: "exact", head: true }),
  ]);

  if (!tplRes.data) notFound();
  const template = tplRes.data as ProcessTemplateRow;
  const stages = (stagesRes.data ?? []) as ProcessTemplateStageRow[];
  const totalTemplates = countRes.count ?? 1;

  return (
    <section className="space-y-6">
      <div>
        <Link
          href="/settings/processes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Procesos
        </Link>
        <h2 className="mt-2 text-lg font-semibold">{template.name}</h2>
      </div>

      <TemplateSettingsForm
        template={template}
        isOnlyTemplate={totalTemplates <= 1}
      />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Etapas</h3>
        <StagesEditor templateId={template.id} initialStages={stages} />
      </div>
    </section>
  );
}
