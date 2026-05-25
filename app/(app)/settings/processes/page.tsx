import { redirect } from "next/navigation";
import {
  hiring,
  type ProcessTemplateRow,
} from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { TemplatesList } from "./_components/templates-list";

export const dynamic = "force-dynamic";

export default async function ProcessesPage() {
  // Admin-only — pipeline blueprints are workspace-wide schema and
  // shouldn't be reshaped by recruiters.
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");

  const db = await hiring();
  // Pull the templates with a cheap stage count alongside so the list
  // can show "N etapas" without an extra round-trip per row.
  const { data: rows } = await db
    .from("process_templates")
    .select("*, process_template_stages(count)")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const templates = ((rows ?? []) as Array<
    ProcessTemplateRow & {
      process_template_stages: { count: number }[];
    }
  >).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    is_default: t.is_default,
    auto_move_contacted_on_outbound: t.auto_move_contacted_on_outbound,
    auto_move_answered_on_reply: t.auto_move_answered_on_reply,
    stage_count: t.process_template_stages?.[0]?.count ?? 0,
  }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Procesos</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Plantillas de pipelines reutilizables. Al crear una vacante eliges
          un proceso y sus etapas se copian al pipeline de la vacante. Editar
          un proceso aquí no afecta vacantes que ya lo usaron.
        </p>
      </div>
      <TemplatesList initialTemplates={templates} />
    </section>
  );
}
