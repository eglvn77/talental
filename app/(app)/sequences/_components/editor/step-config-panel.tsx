"use client";

/**
 * Right-hand Step Configuration panel for the sequence editor.
 * Action type, delay, execution mode, sender, subject/body with
 * variable insertion + templates, enrichment config, save/delete.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Braces, FileText, Loader2, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { deleteStepAction, updateStepAction } from "../../../_actions/sequences";
import type { EditorStep } from "./sequence-editor";
import { KIND_META } from "./sequence-editor";

export type AccountOption = { id: string; provider: string; status: string; label: string };
export type TemplateOption = { id: string; name: string; subject: string | null; content: string };
export type VariableGroup = { group: string; items: Array<{ label: string; value: string }> };

const KIND_OPTIONS = [
  "email",
  "linkedin_invitation",
  "linkedin_message",
  "linkedin_inmail",
  "email_enrichment",
  "manual_task",
];

const PROVIDER_FOR_KIND: Record<string, string[]> = {
  email: ["GOOGLE", "GOOGLE_OAUTH", "OUTLOOK", "IMAP"],
  linkedin_message: ["LINKEDIN"],
  linkedin_invitation: ["LINKEDIN"],
  linkedin_inmail: ["LINKEDIN"],
  linkedin_profile_view: ["LINKEDIN"],
  whatsapp: ["WHATSAPP"],
};

function hasBody(kind: string): boolean {
  return ["email", "linkedin_message", "linkedin_invitation", "linkedin_inmail", "whatsapp", "manual_task"].includes(kind);
}

export function StepConfigPanel({
  step,
  accounts,
  templates,
  variableGroups,
  onClose,
}: {
  step: EditorStep;
  accounts: AccountOption[];
  templates: TemplateOption[];
  variableGroups: VariableGroup[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState(step.kind);
  const initialDelay = step.delay_minutes ?? 0;
  const [delayValue, setDelayValue] = useState(
    initialDelay % (24 * 60) === 0 && initialDelay > 0 ? initialDelay / (24 * 60) : Math.round(initialDelay / 60),
  );
  const [delayUnit, setDelayUnit] = useState<"hours" | "days">(
    initialDelay % (24 * 60) === 0 && initialDelay > 0 ? "days" : "hours",
  );
  const [mode, setMode] = useState(step.execution_mode);
  const [rotation, setRotation] = useState(step.sender_rotation);
  const [senderId, setSenderId] = useState(step.sender_account_id ?? "");
  const [subject, setSubject] = useState(step.subject_template ?? "");
  const [body, setBody] = useState(step.body_template ?? step.task_body ?? "");
  const [emailType, setEmailType] = useState(
    ((step.config as Record<string, unknown> | null)?.email_type as string) ?? "personal",
  );
  const [varsOpen, setVarsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateQuery, setTemplateQuery] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();

  const eligibleAccounts = accounts.filter((a) =>
    (PROVIDER_FOR_KIND[kind] ?? []).includes(a.provider),
  );
  const senderMissing = Boolean(senderId) && !accounts.some((a) => a.id === senderId);

  function insertVariable(value: string) {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + value);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + value + body.slice(end));
    setVarsOpen(false);
  }

  function applyTemplate(t: TemplateOption) {
    if (t.subject) setSubject(t.subject);
    setBody(t.content);
    setTemplatesOpen(false);
  }

  function save() {
    startTransition(async () => {
      const delay_minutes = delayUnit === "days" ? delayValue * 24 * 60 : delayValue * 60;
      const res = await updateStepAction({
        stepId: step.id,
        patch: {
          kind,
          delay_minutes,
          execution_mode: mode as "automatic" | "manual",
          sender_account_id: senderId || null,
          sender_rotation: rotation,
          subject_template: hasBody(kind) && kind === "email" ? subject || null : subject || null,
          body_template: hasBody(kind) ? body || null : null,
          task_body: kind === "manual_task" ? body || null : null,
          config: kind === "email_enrichment" ? { email_type: emailType } : (step.config ?? {}),
        },
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't save step", res.error);
        return;
      }
      toast.actionOk("Step saved");
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm("Delete this step (and any branch hanging from it)?")) return;
    startTransition(async () => {
      const res = await deleteStepAction({ stepId: step.id });
      if (!res.ok) {
        toast.actionFailed("Couldn't delete step", res.error);
        return;
      }
      toast.actionOk("Step deleted");
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="flex w-[360px] shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-semibold">Step Configuration</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded p-1 text-destructive hover:bg-destructive/10"
            aria-label="Delete step"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted" aria-label="Close panel">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Action type */}
        <Field label="Action type">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k]?.label ?? k}
              </option>
            ))}
          </select>
        </Field>

        {/* Delay */}
        <Field label="Delay after previous step">
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={delayValue}
              onChange={(e) => setDelayValue(Math.max(0, Number(e.target.value)))}
              className="w-24 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <select
              value={delayUnit}
              onChange={(e) => setDelayUnit(e.target.value as "hours" | "days")}
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              <option value="hours">Hours</option>
              <option value="days">day(s)</option>
            </select>
          </div>
        </Field>

        {/* Execution mode */}
        <Field label="Execution">
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            <button
              type="button"
              onClick={() => setMode("automatic")}
              className={`flex-1 px-2 py-1.5 ${mode === "automatic" ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}
            >
              Automatic
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`flex-1 px-2 py-1.5 ${mode === "manual" ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}
            >
              Manual
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {mode === "automatic"
              ? "Sent directly via your connected account."
              : "Creates a task for you instead of sending automatically."}
          </p>
        </Field>

        {/* Sender */}
        {(PROVIDER_FOR_KIND[kind] ?? []).length > 0 ? (
          <Field label="Sender">
            {senderMissing ? (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/[0.06] p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                Sender configuration issue — this step references an account that no longer exists.
              </div>
            ) : null}
            <label className="mb-1.5 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={rotation}
                onChange={(e) => setRotation(e.target.checked)}
              />
              Sender rotation (round-robin across eligible accounts)
            </label>
            {!rotation ? (
              <select
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              >
                <option value="">Default ({eligibleAccounts[0]?.label ?? "first available"})</option>
                {eligibleAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} {a.status !== "OK" ? `(${a.status})` : ""}
                  </option>
                ))}
              </select>
            ) : null}
          </Field>
        ) : null}

        {/* Email enrichment config */}
        {kind === "email_enrichment" ? (
          <Field label="Email type to find">
            <select
              value={emailType}
              onChange={(e) => setEmailType(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              <option value="personal">Personal email</option>
              <option value="work">Work email</option>
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              This step attempts to find the contact&apos;s email before the next one runs.
            </p>
          </Field>
        ) : null}

        {/* Content */}
        {hasBody(kind) ? (
          <>
            {kind === "email" || kind === "linkedin_inmail" ? (
              <Field label="Subject">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject…"
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </Field>
            ) : null}
            <Field label={kind === "manual_task" ? "Task instructions" : "Message"}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setVarsOpen((o) => !o);
                      setTemplatesOpen(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    <Braces className="h-3 w-3" />
                    Insert variable
                  </button>
                  {varsOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-md">
                      {variableGroups
                        .filter((g) => g.items.length > 0)
                        .map((g) => (
                          <div key={g.group}>
                            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {g.group}
                            </p>
                            {g.items.map((v) => (
                              <button
                                key={v.value}
                                type="button"
                                onClick={() => insertVariable(v.value)}
                                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
                              >
                                {v.label}
                                <code className="text-[10px] text-muted-foreground">{v.value}</code>
                              </button>
                            ))}
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setTemplatesOpen((o) => !o);
                      setVarsOpen(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    <FileText className="h-3 w-3" />
                    Use template
                  </button>
                  {templatesOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-md">
                      <input
                        type="text"
                        value={templateQuery}
                        onChange={(e) => setTemplateQuery(e.target.value)}
                        placeholder="Search templates…"
                        className="mb-1 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                      {templates
                        .filter((t) =>
                          t.name.toLowerCase().includes(templateQuery.toLowerCase()),
                        )
                        .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => applyTemplate(t)}
                            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                          >
                            <span className="block truncate text-xs font-medium">{t.name}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {t.content.slice(0, 60)}
                            </span>
                          </button>
                        ))}
                      {templates.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-muted-foreground">
                          No templates yet (Settings → Templates).
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                placeholder={
                  kind === "linkedin_invitation"
                    ? "Invitation note (≤300 chars)…"
                    : "Write the message… variables like {{firstName}} are replaced per contact."
                }
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              />
              {kind === "linkedin_invitation" ? (
                <p className={`mt-0.5 text-right text-[11px] ${body.length > 300 ? "text-destructive" : "text-muted-foreground"}`}>
                  {body.length}/300
                </p>
              ) : null}
            </Field>
          </>
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-2.5">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save step
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
