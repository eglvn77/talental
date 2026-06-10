"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "@/lib/toast";
import { createSequenceAction } from "../../_actions/sequences";

/**
 * Leonar's 4-mode creation wizard: Generate with AI / Simple /
 * Advanced / Duplicate existing. Two dialog steps: pick mode →
 * configure → create (and open the editor).
 */

type Mode = "ai" | "simple" | "advanced" | "duplicate";

const MODES: Array<{ key: Mode; title: string; description: string }> = [
  {
    key: "ai",
    title: "Generate with AI",
    description: "Answer a few questions and open a complete draft in the builder.",
  },
  {
    key: "simple",
    title: "Simple mode",
    description: "Start with a straightforward sequence and upgrade later if needed.",
  },
  {
    key: "advanced",
    title: "Advanced mode",
    description: "Create a sequence ready for branching and more advanced logic.",
  },
  {
    key: "duplicate",
    title: "Duplicate existing",
    description: "Reuse an existing sequence structure as the starting point.",
  },
];

const CHANNEL_OPTIONS = [
  { key: "email", label: "Email" },
  { key: "linkedin_invitation", label: "LinkedIn invitation" },
  { key: "linkedin_message", label: "LinkedIn message" },
  { key: "linkedin_inmail", label: "LinkedIn InMail" },
  { key: "manual_task", label: "Call or manual task" },
];

export function NewSequenceButton({
  existing,
}: {
  existing: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<Mode>("ai");
  const [name, setName] = useState("");
  const [duplicateFromId, setDuplicateFromId] = useState(existing[0]?.id ?? "");
  // AI form
  const [goal, setGoal] = useState("recruiting");
  const [followUps, setFollowUps] = useState(3);
  const [tone, setTone] = useState("warm");
  const [language, setLanguage] = useState("es");
  const [channels, setChannels] = useState<string[]>(["email", "linkedin_message"]);
  const [context, setContext] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep(1);
    setName("");
    setContext("");
  }

  function create() {
    startTransition(async () => {
      const res = await createSequenceAction({
        name,
        mode,
        duplicateFromId: mode === "duplicate" ? duplicateFromId : undefined,
        ai:
          mode === "ai"
            ? { goal, followUps, tone, language, channels, context }
            : undefined,
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't create sequence", res.error);
        return;
      }
      toast.actionOk("Sequence created");
      setOpen(false);
      reset();
      router.push(`/sequences/${res.data.id}/editor`);
    });
  }

  const canContinue = step === 1 || (name.trim().length > 0 && (mode !== "duplicate" || duplicateFromId));

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Sequence
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold">Create a sequence</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                {step === 1
                  ? "Choose how you want to start your new sequence."
                  : mode === "ai"
                    ? "Describe the outreach and AI drafts every step."
                    : "Configure your sequence before opening the builder."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {step === 1 ? (
            <div className="mt-4 space-y-2">
              {MODES.map((m) => (
                <label
                  key={m.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                    mode === m.key ? "border-foreground bg-muted/60" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="seq-mode"
                    checked={mode === m.key}
                    onChange={() => setMode(m.key)}
                    className="mt-1"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {m.key === "ai" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                      {m.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{m.description}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <Field label="Sequence name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Senior Developer Outreach"
                  autoFocus
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </Field>

              {mode === "duplicate" ? (
                <Field label="Duplicate from">
                  <select
                    value={duplicateFromId}
                    onChange={(e) => setDuplicateFromId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  >
                    {existing.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {mode === "ai" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Goal">
                      <select
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                      >
                        <option value="recruiting">Recruiting</option>
                        <option value="sales">Sales prospecting</option>
                        <option value="partnership">Partnership</option>
                        <option value="customer_success">Customer success</option>
                        <option value="other">Other</option>
                      </select>
                    </Field>
                    <Field label="Follow-ups">
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={followUps}
                        onChange={(e) => setFollowUps(Number(e.target.value))}
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                      />
                    </Field>
                    <Field label="Tone">
                      <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                      >
                        <option value="direct">Direct</option>
                        <option value="warm">Warm</option>
                        <option value="expert">Expert</option>
                        <option value="short">Short</option>
                        <option value="premium">Premium</option>
                      </select>
                    </Field>
                    <Field label="Message language">
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                      >
                        <option value="es">Español</option>
                        <option value="en">English</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Channels">
                    <div className="flex flex-wrap gap-2">
                      {CHANNEL_OPTIONS.map((c) => (
                        <label
                          key={c.key}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                            channels.includes(c.key)
                              ? "border-foreground bg-muted"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={channels.includes(c.key)}
                            onChange={(e) =>
                              setChannels((prev) =>
                                e.target.checked
                                  ? [...prev, c.key]
                                  : prev.filter((k) => k !== c.key),
                              )
                            }
                            className="h-3 w-3"
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Context">
                    <textarea
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      rows={4}
                      placeholder="Paste a job description, target account context, offer summary, ICP, pain points…"
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                    />
                  </Field>
                </>
              ) : null}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Back
              </button>
            ) : (
              <Dialog.Close asChild>
                <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  Cancel
                </button>
              </Dialog.Close>
            )}
            <button
              type="button"
              disabled={!canContinue || pending}
              onClick={() => {
                if (step === 1) setStep(2);
                else create();
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {step === 1 ? "Continue" : mode === "ai" ? "Generate draft" : "Create"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
