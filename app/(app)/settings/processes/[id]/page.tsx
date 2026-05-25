import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";
import {
  hiring,
  type ProcessTemplateRow,
  type ProcessTemplateStageRow,
} from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { StagesEditor } from "../_components/stages-editor";

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
  const { data: tplData } = await db
    .from("process_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!tplData) notFound();
  const template = tplData as ProcessTemplateRow;

  const { data: stagesData } = await db
    .from("process_template_stages")
    .select("*")
    .eq("template_id", id)
    .order("position", { ascending: true });
  const stages = (stagesData ?? []) as ProcessTemplateStageRow[];

  return (
    <section className="space-y-4">
      <div>
        <Link
          href="/settings/processes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Procesos
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold">{template.name}</h2>
          {template.is_default ? (
            <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
              <Star className="h-2.5 w-2.5 fill-current" />
              Por defecto
            </span>
          ) : null}
        </div>
        {template.description ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {template.description}
          </p>
        ) : null}
      </div>

      <StagesEditor templateId={template.id} initialStages={stages} />
    </section>
  );
}
