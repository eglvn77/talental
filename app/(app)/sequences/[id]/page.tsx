import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { deriveBoardStage } from "@/lib/sequences/engine";
import { PageContainer } from "../../_components/page-shell";
import { SequenceStatusToggle } from "../_components/sequence-status-toggle";
import {
  ProspectsView,
  type ProspectRow,
  type StepOption,
} from "../_components/prospects-view";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  email: "Email",
  linkedin_message: "LinkedIn Message",
  linkedin_invitation: "LinkedIn Invitation",
  linkedin_inmail: "LinkedIn InMail",
  linkedin_profile_view: "Profile View",
  whatsapp: "WhatsApp",
  phone_call: "Phone Call",
  email_enrichment: "Email Enrichment",
  phone_enrichment: "Phone Enrichment",
  manual_task: "Manual Step",
  wait: "Wait",
};

export default async function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: seq } = await db
    .from("sequences")
    .select("id, name, status, workspace_id")
    .eq("id", id)
    .maybeSingle();
  if (!seq || (seq.workspace_id as string) !== workspaceId) notFound();

  const { data: stepRows } = await db
    .from("sequence_steps")
    .select("id, kind, position, parent_step_id, branch_path")
    .eq("sequence_id", id)
    .order("position", { ascending: true });
  const stepOptions: StepOption[] = (stepRows ?? [])
    .filter((s) => !s.parent_step_id || true)
    .map((s, i) => ({
      id: s.id as string,
      label: `${i + 1}. ${KIND_LABEL[s.kind as string] ?? s.kind}${
        s.branch_path ? ` (${s.branch_path})` : ""
      }`,
    }));

  const { data: enrRows } = await db
    .from("sequence_enrollments")
    .select(
      "id, status, enrolled_at, current_step_id, next_run_at, entity_id, entity_type",
    )
    .eq("sequence_id", id)
    .order("enrolled_at", { ascending: false });

  // Candidate names
  const candidateIds = (enrRows ?? [])
    .filter((e) => e.entity_type === "candidate")
    .map((e) => e.entity_id as string);
  const candidateById = new Map<string, { name: string; headline: string | null; linkedin: string | null }>();
  if (candidateIds.length > 0) {
    const { data: cands } = await db
      .from("candidates")
      .select("id, full_name, headline, linkedin_url")
      .in("id", candidateIds);
    for (const c of cands ?? []) {
      candidateById.set(c.id as string, {
        name: (c.full_name as string) ?? "(unnamed)",
        headline: (c.headline as string | null) ?? null,
        linkedin: (c.linkedin_url as string | null) ?? null,
      });
    }
  }

  // Queue aggregates per enrollment + channel pills + queue subcount
  const enrollmentIds = (enrRows ?? []).map((e) => e.id as string);
  const sentByEnrollment = new Map<string, number>();
  const failedByEnrollment = new Set<string>();
  const lastSentByEnrollment = new Map<string, { type: string; at: string }>();
  const channelCounts = new Map<string, number>();
  let queuePending = 0;
  if (enrollmentIds.length > 0) {
    const { data: queueRows } = await db
      .from("sequence_queue")
      .select("enrollment_id, type, status, completed_at, scheduled_at")
      .in("enrollment_id", enrollmentIds);
    for (const qr of queueRows ?? []) {
      const eid = qr.enrollment_id as string;
      if (qr.status === "completed") {
        sentByEnrollment.set(eid, (sentByEnrollment.get(eid) ?? 0) + 1);
        channelCounts.set(qr.type as string, (channelCounts.get(qr.type as string) ?? 0) + 1);
        const at = (qr.completed_at as string) ?? "";
        const prev = lastSentByEnrollment.get(eid);
        if (!prev || prev.at < at) lastSentByEnrollment.set(eid, { type: qr.type as string, at });
      }
      if (qr.status === "failed") failedByEnrollment.add(eid);
      if (qr.status === "pending") queuePending++;
    }
  }

  const stepLabelById = new Map(stepOptions.map((s) => [s.id, s.label]));
  const prospects: ProspectRow[] = (enrRows ?? []).map((e) => {
    const cand = candidateById.get(e.entity_id as string);
    const sent = sentByEnrollment.get(e.id as string) ?? 0;
    const last = lastSentByEnrollment.get(e.id as string);
    return {
      enrollmentId: e.id as string,
      candidateId: e.entity_id as string,
      name: cand?.name ?? "(unknown)",
      headline: cand?.headline ?? null,
      hasLinkedin: Boolean(cand?.linkedin),
      status: e.status as string,
      enrolledAt: (e.enrolled_at as string | null) ?? null,
      nextRunAt: (e.next_run_at as string | null) ?? null,
      currentStepLabel: e.current_step_id
        ? stepLabelById.get(e.current_step_id as string) ?? null
        : null,
      lastStep: last ? `${KIND_LABEL[last.type] ?? last.type}` : null,
      lastStepAt: last?.at ?? null,
      sent,
      boardStage: deriveBoardStage({
        status: e.status as string,
        sentCount: sent,
        hasFailedQueue: failedByEnrollment.has(e.id as string),
      }),
    };
  });

  const total = prospects.length;
  const active = prospects.filter((p) => p.status === "active").length;
  const replied = prospects.filter((p) => p.status === "replied").length;
  const repliedPct = total > 0 ? Math.round((replied / total) * 100) : 0;

  return (
    <PageContainer className="max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/sequences"
          className="rounded-md border border-border p-1.5 hover:bg-muted"
          aria-label="Back to sequences"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{seq.name as string}</h1>
        <div className="ml-auto flex items-center gap-2">
          <SequenceStatusToggle sequenceId={id} status={seq.status as string} />
          <Link
            href={`/sequences/${id}/editor`}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Sequence
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="Total" value={String(total)} />
        <StatCard label="Active" value={String(active)} />
        <StatCard label="Replied" value={`${replied} (${repliedPct}%)`} highlight />
      </div>

      {/* Channel pills */}
      {channelCounts.size > 0 || queuePending > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {[...channelCounts.entries()].map(([type, count]) => (
            <span key={type} className="rounded-md border border-border bg-card px-2 py-1">
              {count} {KIND_LABEL[type] ?? type} sent
            </span>
          ))}
          {queuePending > 0 ? (
            <span className="rounded-md border border-border bg-card px-2 py-1">
              {queuePending} queued
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <ProspectsView sequenceId={id} prospects={prospects} stepOptions={stepOptions} />
      </div>
    </PageContainer>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-md border bg-card px-4 py-3 ${
        highlight ? "border-foreground/40" : "border-border"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
