import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hiring, type PromptRow } from "@/lib/hiring";
import { ensurePromptAction } from "../actions";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { NewPromptButton } from "./new-prompt-button";

export const dynamic = "force-dynamic";

const PROMPTS_INDEX: Array<{ key: string; label: string; description: string }> = [
  {
    key: "kickoff_master",
    label: "Kickoff Master",
    description:
      "Genera el package completo de un rol (JD, sourcing, interview script, outreach, LinkedIn post, checklist) a partir del intake call.",
  },
];

export default async function PromptsIndexPage() {
  const me = await getCurrentUser();
  if (!me || me.team_member.team_role !== "owner") notFound();

  // Auto-seed any prompts that don't exist yet, so the first visit
  // populates the table from PROMPT_DEFAULTS.
  for (const p of PROMPTS_INDEX) {
    await ensurePromptAction(p.key);
  }

  const db = await hiring();
  const { data } = await db
    .from("prompts")
    .select("*")
    .order("key", { ascending: true });
  const prompts = (data ?? []) as PromptRow[];

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Prompts</h2>
          <p className="text-xs text-muted-foreground">
            Editable solo por el owner. Los cambios aplican inmediatamente al
            siguiente uso. Los prompts del sistema (como Kickoff Master) tienen
            "Restaurar default".
          </p>
        </div>
        <NewPromptButton />
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        {prompts.map((p) => {
          const meta = PROMPTS_INDEX.find((x) => x.key === p.key);
          return (
            <li key={p.id}>
              <Link
                href={`/settings/prompts/${p.key}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {p.label}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {p.key}
                    </span>
                  </div>
                  {meta?.description ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {meta.description}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Modelo: <span className="font-mono">{p.model}</span> ·
                    actualizado{" "}
                    {new Date(p.updated_at).toLocaleString("es-MX")}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">Editar →</span>
              </Link>
            </li>
          );
        })}
      </ul>
      </section>
    </>
  );
}
