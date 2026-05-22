"use client";

import { useState, useTransition } from "react";
import { Mail, Linkedin, MessageSquare } from "lucide-react";
import { toast } from "@/lib/toast";
import { updateSequenceStepAction } from "@/app/(app)/actions";

type SequenceStep = {
  id: string;
  position: number;
  kind: string;
  delay_minutes: number | null;
  subject_template: string | null;
  body_template: string | null;
  task_title: string | null;
  task_body: string | null;
  config: { channel?: string } | null;
};

type SequenceWithSteps = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  steps: SequenceStep[];
};

const CHANNEL_LABEL: Record<string, { label: string; Icon: typeof Mail }> = {
  email: { label: "Email", Icon: Mail },
  linkedin_invitation: { label: "LinkedIn Invitation", Icon: Linkedin },
  linkedin_inmail: { label: "LinkedIn InMail", Icon: Linkedin },
  linkedin_message: { label: "LinkedIn Message", Icon: MessageSquare },
};

function describeDelay(minutes: number | null): string {
  if (!minutes) return "Inmediato";
  const hours = Math.round(minutes / 60);
  if (hours === 0) return `+${minutes} min`;
  if (hours < 24) return `+${hours}h`;
  const days = Math.round(hours / 24);
  return `+${days}d`;
}

function channelOf(step: SequenceStep): string {
  return (step.config?.channel as string | undefined) ?? step.kind;
}

export function SequenceEditor({
  sequences,
}: {
  sequences: SequenceWithSteps[];
}) {
  return (
    <div className="space-y-6">
      {sequences.map((seq, idx) => (
        <div key={seq.id}>
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-medium">{seq.name}</span>
            <span className="text-muted-foreground">
              {seq.status} ·{" "}
              {new Date(seq.created_at).toLocaleDateString("es-MX")}
            </span>
          </div>
          <ol className="space-y-3">
            {seq.steps.map((step) => (
              <StepEditor key={step.id} step={step} />
            ))}
          </ol>
          {idx < sequences.length - 1 ? (
            <div className="mt-4 border-t border-dashed border-border" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StepEditor({ step }: { step: SequenceStep }) {
  const channel = channelOf(step);
  const meta = CHANNEL_LABEL[channel] ??
    CHANNEL_LABEL[step.kind] ?? { label: step.kind, Icon: Mail };
  const Icon = meta.Icon;

  const isInvitation = channel === "linkedin_invitation";
  const hasSubject = channel === "email" || channel === "linkedin_inmail";
  const initialSubject = step.subject_template ?? "";
  const initialBody = step.body_template ?? step.task_body ?? "";

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [, startTransition] = useTransition();

  function persistSubject() {
    if (subject === initialSubject) return;
    startTransition(async () => {
      const res = await updateSequenceStepAction({
        stepId: step.id,
        subject,
      });
      if (!res.ok) toast.saveFailed(res.error);
      // Local state holds the new value; no router.refresh needed.
    });
  }

  function persistBody() {
    if (body === initialBody) return;
    startTransition(async () => {
      const res = await updateSequenceStepAction({ stepId: step.id, body });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <li className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted font-mono text-[10px]">
          {step.position}
        </span>
        <span className="inline-flex items-center gap-1 font-medium">
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        <span className="text-muted-foreground">
          {describeDelay(step.delay_minutes)}
        </span>
      </div>

      {isInvitation ? (
        <p className="text-xs italic text-muted-foreground">
          Connection request — sin mensaje.
        </p>
      ) : (
        <div className="space-y-2">
          {hasSubject ? (
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onBlur={persistSubject}
              placeholder="Asunto"
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm font-medium"
            />
          ) : null}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={persistBody}
            rows={Math.max(3, Math.min(14, (body.split("\n").length || 0) + 1))}
            placeholder="Cuerpo del mensaje"
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm leading-relaxed"
          />
        </div>
      )}
    </li>
  );
}
