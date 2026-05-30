import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { hiring, type PromptRow } from "@/lib/hiring";
import { PROMPT_CATEGORIES } from "@/lib/prompts/categories";
import { ensurePromptAction } from "../actions";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { DeletePromptButton } from "./delete-prompt-button";
import { NewPromptButton } from "./new-prompt-button";
import { SetDefaultButton } from "./set-default-button";

export const dynamic = "force-dynamic";

/** System prompts auto-seeded on first visit so the table is never empty. */
const SEED_KEYS = ["kickoff_master"];

export default async function PromptsIndexPage() {
  const t = await getT();
  const me = await getCurrentUser();
  if (!me || me.team_member.team_role !== "owner") notFound();

  for (const key of SEED_KEYS) {
    await ensurePromptAction(key);
  }

  const db = await hiring();
  const { data } = await db
    .from("prompts")
    .select("*")
    .order("is_default", { ascending: false })
    .order("label", { ascending: true });
  const prompts = (data ?? []) as PromptRow[];

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-6">
        <p className="text-xs text-muted-foreground">
          {t("promptsCfg.introBefore")}{" "}
          <strong>{t("promptsCfg.introCategory")}</strong>{" "}
          {t("promptsCfg.introAfter")}
        </p>

        {PROMPT_CATEGORIES.map((cat) => {
          const inCat = prompts.filter(
            (p) => (p.category ?? "kickoff") === cat.key,
          );
          const catLabel =
            cat.key === "candidate_report"
              ? t("promptCat.candidateReportLabel")
              : t("promptCat.kickoffLabel");
          const catDesc =
            cat.key === "candidate_report"
              ? t("promptCat.candidateReportDesc")
              : t("promptCat.kickoffDesc");
          return (
            <div key={cat.key} className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">{catLabel}</h2>
                  <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                    {catDesc}
                  </p>
                </div>
                <NewPromptButton category={cat.key} categoryLabel={catLabel} />
              </div>

              {inCat.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  {t("promptsCfg.emptyCategory")}
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {inCat.map((p) => {
                    const isDefault = p.is_default === true;
                    const isSystem = SEED_KEYS.includes(p.key);
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-1 px-2 transition-colors hover:bg-muted"
                      >
                        <Link
                          href={`/settings/prompts/${p.key}`}
                          className="min-w-0 flex-1 py-3 pl-2"
                        >
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {p.label}
                            {isDefault ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                {t("promptsCfg.defaultBadge")}
                              </span>
                            ) : null}
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {p.key}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {t("promptsCfg.modelLabel")}:{" "}
                            <span className="font-mono">{p.model}</span>{" "}
                            · {t("promptsCfg.updatedLabel")}{" "}
                            {new Date(p.updated_at).toLocaleString("es-MX")}
                          </div>
                        </Link>
                        {!isDefault ? <SetDefaultButton promptId={p.id} /> : null}
                        {!isSystem && !isDefault ? (
                          <DeletePromptButton
                            promptId={p.id}
                            promptKey={p.key}
                            promptLabel={p.label}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
