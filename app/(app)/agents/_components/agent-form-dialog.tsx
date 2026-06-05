"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Play, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { AVAILABLE_MODELS } from "@/lib/models";
import type {
  AgentKind,
  AgentRuntime,
  AgentStatus,
} from "@/lib/hiring/enums";
import type { AgentAreaRow } from "@/lib/hiring";
import type { AgentWithPrompt } from "../_loaders/load-org";
import {
  createAgentAction,
  deleteAgentAction,
  updateAgentAction,
} from "../_actions/agents";

/**
 * Single dialog that handles both create and edit. URL-driven (the
 * caller toggles open via ?agent=<id|new>), so deep links and the
 * browser back button work the same as the candidate slideover.
 *
 * Status is exposed as a primary control on the right of the header
 * because it's the toggle that gets touched most often. Everything
 * else is form fields below.
 */
export function AgentFormDialog({
  open,
  onOpenChange,
  agent,
  seedForCreate,
  areas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = create, AgentWithPrompt = edit. */
  agent: AgentWithPrompt | null;
  /** Optional pre-fill for the create flow (e.g. area pre-selected
   *  when the user clicks "+ Agent" inside an area). */
  seedForCreate?: Partial<AgentWithPrompt> | null;
  areas: AgentAreaRow[];
}) {
  const t = useT();
  const router = useRouter();
  const isEdit = agent !== null;

  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<AgentKind>("executor");
  const [status, setStatus] = useState<AgentStatus>("planned");
  const [runtime, setRuntime] = useState<AgentRuntime>("claude_code");
  const [areaId, setAreaId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [scheduleCron, setScheduleCron] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, start] = useTransition();
  // Run-now state — separate from form `busy` so the user can still
  // click "Save" while a run is in flight (and vice versa).
  const [running, setRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<{
    status: "ok" | "error";
    summary: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (agent) {
      setName(agent.name);
      setRoleTitle(agent.role_title ?? "");
      setDescription(agent.description ?? "");
      setKind(agent.kind as AgentKind);
      setStatus(agent.status as AgentStatus);
      setRuntime(agent.runtime as AgentRuntime);
      setAreaId(agent.area_id ?? "");
      setModel(agent.model ?? "");
      setScheduleCron(agent.schedule_cron ?? "");
      setSlackChannelId(agent.slack_channel_id ?? "");
    } else {
      setName("");
      setRoleTitle("");
      setDescription("");
      setKind("executor");
      setStatus("planned");
      setRuntime("claude_code");
      setAreaId(seedForCreate?.area_id ?? "");
      setModel("");
      setScheduleCron("");
      setSlackChannelId("");
    }
  }, [open, agent, seedForCreate]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const patch = {
      name: name.trim(),
      role_title: roleTitle.trim() || null,
      description: description.trim() || null,
      status,
      kind,
      runtime,
      area_id: areaId || null,
      model: model || null,
      schedule_cron: scheduleCron.trim() || null,
      slack_channel_id: slackChannelId.trim() || null,
    };
    const res = isEdit
      ? await updateAgentAction(agent!.id, patch)
      : await createAgentAction({
          name: patch.name,
          area_id: patch.area_id,
          kind: patch.kind,
          status: patch.status,
          runtime: patch.runtime,
          role_title: patch.role_title,
          description: patch.description,
        });
    setBusy(false);
    if (!res.ok) {
      toast.actionFailed(t("agentsArea.save"), res.error);
      return;
    }
    toast.actionOk(t("agentsArea.save"));
    onOpenChange(false);
    router.refresh();
  }

  function onDelete() {
    if (!agent) return;
    start(async () => {
      const res = await deleteAgentAction(agent.id);
      if (!res.ok) {
        toast.actionFailed(t("agentsArea.editAgent"), res.error);
        return;
      }
      setConfirmDelete(false);
      onOpenChange(false);
      router.refresh();
    });
  }

  async function onRunNow() {
    if (!agent) return;
    setRunning(true);
    setLastRunResult(null);
    try {
      const r = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "manual" }),
      });
      const raw = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        const msg =
          typeof raw.error === "string" ? raw.error : `HTTP ${r.status}`;
        setLastRunResult({
          status: "error",
          summary: msg,
          tokensIn: null,
          tokensOut: null,
          error: msg,
        });
        toast.actionFailed("Run", msg);
        return;
      }
      // 200 OK ⇒ the body is the runAgent() RunResult shape.
      const status =
        raw.status === "ok" || raw.status === "error" ? raw.status : "error";
      const next = {
        status: status as "ok" | "error",
        summary: typeof raw.summary === "string" ? raw.summary : null,
        tokensIn: typeof raw.tokensIn === "number" ? raw.tokensIn : null,
        tokensOut: typeof raw.tokensOut === "number" ? raw.tokensOut : null,
        error: typeof raw.error === "string" ? raw.error : null,
      };
      setLastRunResult(next);
      if (next.status === "ok") {
        toast.actionOk("Run completed");
        router.refresh();
      } else {
        toast.actionFailed("Run", next.error ?? "error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastRunResult({
        status: "error",
        summary: msg,
        tokensIn: null,
        tokensOut: null,
        error: msg,
      });
      toast.actionFailed("Run", msg);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t("agentsArea.editAgent") : t("agentsArea.addAgent")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3 px-5 pb-3 text-sm">
            {/* Name + Role */}
            <Field label={t("agentsArea.initiativeTitle")} required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label={t("agentsArea.roleTitle")}>
              <Input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
              />
            </Field>
            <Field label={t("agentsArea.description")}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("agentsArea.initiativeArea")}>
                <Select
                  value={areaId}
                  onChange={(v) => setAreaId(v)}
                  options={[
                    { value: "", label: "—" },
                    ...areas.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              </Field>
              <Field label={t("agentsArea.initiativeStatus")}>
                <Select
                  value={status}
                  onChange={(v) => setStatus(v as AgentStatus)}
                  options={[
                    { value: "active", label: t("agentsArea.statusActive") },
                    { value: "planned", label: t("agentsArea.statusPlanned") },
                    { value: "paused", label: t("agentsArea.statusPaused") },
                  ]}
                />
              </Field>
              <Field label={t("agentsArea.initiativeType")}>
                <Select
                  value={kind}
                  onChange={(v) => setKind(v as AgentKind)}
                  options={[
                    {
                      value: "chief_of_staff",
                      label: t("agentsArea.kindChief"),
                    },
                    { value: "area_lead", label: t("agentsArea.kindLead") },
                    {
                      value: "executor",
                      label: t("agentsArea.kindExecutor"),
                    },
                  ]}
                />
              </Field>
              <Field label="Runtime">
                <Select
                  value={runtime}
                  onChange={(v) => setRuntime(v as AgentRuntime)}
                  options={[
                    {
                      value: "claude_code",
                      label: t("agentsArea.runtimeClaudeCode"),
                    },
                    { value: "in_app", label: t("agentsArea.runtimeInApp") },
                  ]}
                />
              </Field>
              <Field label={t("agentsArea.model")}>
                <Select
                  value={model}
                  onChange={(v) => setModel(v)}
                  options={[
                    { value: "", label: "—" },
                    ...AVAILABLE_MODELS.map((m) => ({
                      value: m.value,
                      label: m.label,
                    })),
                  ]}
                />
              </Field>
              <Field label={t("agentsArea.scheduleCron")}>
                <Input
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  placeholder="0 9 * * 1-5"
                  className="font-mono"
                />
              </Field>
            </div>

            <Field label={t("agentsArea.slackChannel")}>
              <Input
                value={slackChannelId}
                onChange={(e) => setSlackChannelId(e.target.value)}
                placeholder="C01ABCDEF or #agent-cto"
              />
            </Field>

            {/* Prompt — link out to /settings/prompts/[key]?return=/agents.
                Sub-phase 1c will replace the placeholder when agent.prompt
                is null with an inline "create + link" action. */}
            {isEdit && agent ? (
              <div className="rounded-md border border-border bg-bg-2 px-3 py-2 text-xs">
                <div className="mb-1 font-medium text-muted-foreground">
                  Prompt
                </div>
                {agent.prompt ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{agent.prompt.label}</span>
                    <Link
                      href={`/settings/prompts/${agent.prompt.key}?return=/agents`}
                      className="shrink-0 text-accent hover:underline"
                    >
                      {t("agentsArea.editPrompt")} →
                    </Link>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    {t("agentsArea.noPromptLinked")}
                  </p>
                )}
              </div>
            ) : null}

            {/* Run-now — only available when the agent is operationally
                ready (active + has a prompt + in-app runtime). Other
                cases get a disabled button with the reason inline. */}
            {isEdit && agent ? (
              <div className="rounded-md border border-border bg-bg-2 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-muted-foreground">
                      Run now
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {runNowReason(agent) ??
                        "Triggers an in-app execution. Result lands in the dashboard activity feed."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onRunNow}
                    disabled={running || runNowReason(agent) !== null}
                    className="gap-1.5"
                  >
                    {running ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {running ? "Running…" : "Run now"}
                  </Button>
                </div>
                {lastRunResult ? (
                  <div
                    className={cn(
                      "mt-2 rounded border px-2 py-1.5 text-[11px]",
                      lastRunResult.status === "ok"
                        ? "border-positive/30 bg-positive-soft text-positive"
                        : "border-danger/30 bg-danger-soft text-danger",
                    )}
                  >
                    {lastRunResult.status === "ok" ? (
                      <>
                        {lastRunResult.summary ?? "OK"}
                        {lastRunResult.tokensIn != null ||
                        lastRunResult.tokensOut != null ? (
                          <span className="ml-2 text-[10px] opacity-70 tabular-nums">
                            {lastRunResult.tokensIn ?? 0}
                            {" in / "}
                            {lastRunResult.tokensOut ?? 0}
                            {" out tokens"}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      lastRunResult.error ?? "Run failed"
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              {isEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="gap-1.5 text-danger hover:bg-danger-soft/40 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  {t("agentsArea.cancel")}
                </Button>
                <Button type="submit" disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {busy ? t("agentsArea.saving") : t("agentsArea.save")}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(v) => !busy && setConfirmDelete(v)}
        title={`Delete ${agent?.name ?? "agent"}?`}
        description="This removes the agent. Past runs survive (agent_id is set null)."
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * Returns a human-readable reason the agent CAN'T be run right now,
 * or null when it's good to go. Used to disable the button AND label
 * why so the operator isn't left guessing.
 */
function runNowReason(agent: AgentWithPrompt): string | null {
  if (agent.status !== "active") {
    return `Agent is ${agent.status}; set to active to enable runs.`;
  }
  if (agent.runtime !== "in_app") {
    return `Runtime is ${agent.runtime}; only 'in_app' agents run here. claude_code agents run externally.`;
  }
  if (!agent.prompt) {
    return "No prompt linked. Link a prompt from /settings/prompts to enable.";
  }
  return null;
}
