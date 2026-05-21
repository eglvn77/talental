import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hiring, type PromptRow } from "@/lib/hiring";
import { ensurePromptAction } from "../../actions";
import { PromptEditor } from "./prompt-editor";

export const dynamic = "force-dynamic";

const KNOWN_KEYS = ["kickoff_master"];

export default async function PromptEditPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  if (!KNOWN_KEYS.includes(key)) notFound();

  const me = await getCurrentUser();
  if (!me || me.team_member.team_role !== "owner") notFound();

  // Make sure it exists (auto-seed if first visit somehow skipped index).
  await ensurePromptAction(key);

  const db = await hiring();
  const { data } = await db
    .from("prompts")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (!data) notFound();
  const prompt = data as PromptRow;

  return (
    <section className="space-y-4">
      <div className="text-xs">
        <Link
          href="/settings/prompts"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Prompts
        </Link>
      </div>
      <div>
        <h2 className="text-lg font-semibold">{prompt.label}</h2>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{prompt.key}</span> ·
          {" Modelo: "}
          <span className="font-mono">{prompt.model}</span>
        </p>
      </div>
      <PromptEditor prompt={prompt} />
    </section>
  );
}
