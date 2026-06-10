"use client";

/**
 * Visual sequence builder — React Flow canvas on the left (Start node,
 * vertical action chains, Yes/No branch lanes, delay labels on edges),
 * contextual Step Configuration panel on the right. Mirrors Leonar's
 * editor; delays are edited in the panel rather than on dedicated
 * delay nodes.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  GitBranch,
  Linkedin,
  Mail,
  MessageCircle,
  Phone,
  Play,
  Plus,
  Search,
  UserRoundSearch,
  Wrench,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { addStepAction } from "../../../_actions/sequences";
import { StepConfigPanel, type AccountOption, type TemplateOption, type VariableGroup } from "./step-config-panel";

export type EditorStep = {
  id: string;
  sequence_id: string;
  position: number;
  kind: string;
  delay_minutes: number | null;
  subject_template: string | null;
  body_template: string | null;
  task_title: string | null;
  task_body: string | null;
  config: Record<string, unknown> | null;
  execution_mode: string;
  sender_account_id: string | null;
  sender_rotation: boolean;
  parent_step_id: string | null;
  branch_path: string | null;
  branch_condition: string | null;
};

export const KIND_META: Record<string, { label: string; accent: string }> = {
  email: { label: "Email", accent: "text-sky-500" },
  linkedin_message: { label: "LinkedIn Message", accent: "text-blue-600" },
  linkedin_invitation: { label: "LinkedIn Invitation", accent: "text-blue-600" },
  linkedin_inmail: { label: "LinkedIn InMail", accent: "text-blue-600" },
  linkedin_profile_view: { label: "Profile View", accent: "text-blue-600" },
  whatsapp: { label: "WhatsApp", accent: "text-green-600" },
  phone_call: { label: "Phone Call", accent: "text-emerald-600" },
  email_enrichment: { label: "Email Enrichment", accent: "text-violet-600" },
  phone_enrichment: { label: "Phone Enrichment", accent: "text-violet-600" },
  manual_task: { label: "Manual Step", accent: "text-amber-600" },
  wait: { label: "Wait", accent: "text-muted-foreground" },
};

const ADDABLE_KINDS = [
  "email",
  "linkedin_invitation",
  "linkedin_message",
  "linkedin_inmail",
  "email_enrichment",
  "manual_task",
];

const CONDITIONS = [
  { key: "connected_on_linkedin", label: "Connected on LinkedIn" },
  { key: "already_contacted", label: "Already contacted" },
  { key: "has_email", label: "Has email" },
  { key: "has_phone", label: "Has phone" },
];

export function kindIcon(kind: string, className = "h-3.5 w-3.5") {
  if (kind.startsWith("linkedin")) return <Linkedin className={className} />;
  if (kind === "email") return <Mail className={className} />;
  if (kind === "whatsapp") return <MessageCircle className={className} />;
  if (kind === "phone_call") return <Phone className={className} />;
  if (kind === "email_enrichment" || kind === "phone_enrichment")
    return <Search className={className} />;
  if (kind === "manual_task") return <Wrench className={className} />;
  return <UserRoundSearch className={className} />;
}

function delayLabel(minutes: number | null): string {
  const m = minutes ?? 0;
  if (m === 0) return "0h";
  if (m < 24 * 60) return `${Math.round(m / 60)}h`;
  const d = Math.round(m / (24 * 60));
  return `${d} day${d === 1 ? "" : "(s)"}`;
}

// ============================================================
// Graph layout — vertical chains, branches split horizontally
// ============================================================

type StepNodeData = { step: EditorStep; selected: boolean };

const NODE_W = 240;
const NODE_GAP_Y = 110;
const BRANCH_GAP_X = 300;

function layoutGraph(steps: EditorStep[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "start",
      position: { x: 0, y: 0 },
      data: {},
      type: "start",
      draggable: false,
    },
  ];
  const edges: Edge[] = [];

  const lane = (parentId: string | null, branch: string | null) =>
    steps
      .filter((s) => s.parent_step_id === parentId && s.branch_path === branch)
      .sort((a, b) => a.position - b.position);

  let maxRow = 0;
  function placeLane(
    laneSteps: EditorStep[],
    fromNodeId: string,
    x: number,
    row: number,
    edgeLabelPrefix?: string,
  ): void {
    let prev = fromNodeId;
    let r = row;
    for (let i = 0; i < laneSteps.length; i++) {
      const step = laneSteps[i];
      nodes.push({
        id: step.id,
        position: { x, y: r * NODE_GAP_Y + 80 },
        data: { step } as unknown as Record<string, unknown>,
        type: "step",
        draggable: false,
      });
      edges.push({
        id: `${prev}->${step.id}`,
        source: prev,
        target: step.id,
        label:
          i === 0 && edgeLabelPrefix
            ? `${edgeLabelPrefix} · ${delayLabel(step.delay_minutes)}`
            : delayLabel(step.delay_minutes),
        style: { strokeWidth: 1.5 },
        labelStyle: { fontSize: 10 },
      });
      prev = step.id;
      r++;
      maxRow = Math.max(maxRow, r);
      // Branch lanes off this step
      const yes = lane(step.id, "yes");
      const no = lane(step.id, "no");
      if (yes.length > 0 || no.length > 0) {
        const cond =
          yes[0]?.branch_condition ?? no[0]?.branch_condition ?? "condition";
        const condLabel = CONDITIONS.find((c) => c.key === cond)?.label ?? cond;
        placeLane(yes, step.id, x - BRANCH_GAP_X / 2 - NODE_W / 2, r, `Yes — ${condLabel}`);
        placeLane(no, step.id, x + BRANCH_GAP_X / 2 + NODE_W / 2, r, `No — ${condLabel}`);
        r = maxRow;
      }
    }
  }

  // Root: linear lane or entry-condition fork
  const rootLinear = lane(null, null);
  if (rootLinear.length > 0) {
    placeLane(rootLinear, "start", 0, 0);
  } else {
    const yes = lane(null, "yes");
    const no = lane(null, "no");
    if (yes.length > 0 || no.length > 0) {
      const cond = yes[0]?.branch_condition ?? no[0]?.branch_condition ?? "condition";
      const condLabel = CONDITIONS.find((c) => c.key === cond)?.label ?? cond;
      placeLane(yes, "start", -BRANCH_GAP_X / 2 - NODE_W / 2, 0, `Yes — ${condLabel}`);
      placeLane(no, "start", BRANCH_GAP_X / 2 + NODE_W / 2, 0, `No — ${condLabel}`);
    }
  }

  return { nodes, edges };
}

// ============================================================
// Node renderers
// ============================================================

function StartNode() {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-foreground px-3 py-1.5 text-xs font-medium text-background">
      <Handle type="source" position={Position.Bottom} className="!bg-transparent" />
      <Play className="h-3 w-3" />
      Start
    </div>
  );
}

function StepNode({ data, selected }: NodeProps) {
  const step = (data as unknown as StepNodeData).step;
  const meta = KIND_META[step.kind] ?? { label: step.kind, accent: "" };
  return (
    <div
      className={`w-[240px] rounded-md border bg-card px-3 py-2 shadow-sm transition-colors ${
        selected ? "border-foreground ring-1 ring-foreground" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent" />
      <div className="flex items-center gap-2">
        <span className={meta.accent}>{kindIcon(step.kind)}</span>
        <span className="truncate text-sm font-medium">{meta.label}</span>
        <span
          className={`ml-auto rounded-full border px-1.5 py-0.5 text-[10px] uppercase ${
            step.execution_mode === "manual"
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {step.execution_mode === "manual" ? "Manual" : "Auto"}
        </span>
      </div>
      {step.subject_template ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{step.subject_template}</p>
      ) : step.body_template ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{step.body_template}</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent" />
    </div>
  );
}

const nodeTypes = { start: StartNode, step: StepNode };

// ============================================================
// Editor shell
// ============================================================

export function SequenceEditor({
  sequence,
  steps,
  hasEnrollments,
  accounts,
  templates,
  customVariables,
}: {
  sequence: { id: string; name: string; status: string; mode: "simple" | "advanced" };
  steps: EditorStep[];
  hasEnrollments: boolean;
  accounts: AccountOption[];
  templates: TemplateOption[];
  customVariables: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(false);

  const selected = steps.find((s) => s.id === selectedId) ?? null;
  const { nodes, edges } = useMemo(() => {
    const g = layoutGraph(steps);
    return {
      nodes: g.nodes.map((n) =>
        n.type === "step" ? { ...n, selected: n.id === selectedId } : n,
      ),
      edges: g.edges,
    };
  }, [steps, selectedId]);

  const variableGroups: VariableGroup[] = useMemo(
    () => [
      {
        group: "Contact",
        items: [
          { label: "First name", value: "{{firstName}}" },
          { label: "Last name", value: "{{lastName}}" },
          { label: "Full name", value: "{{fullName}}" },
          { label: "Email", value: "{{email}}" },
          { label: "Phone", value: "{{phone}}" },
          { label: "Job title", value: "{{title}}" },
          { label: "LinkedIn URL", value: "{{linkedinUrl}}" },
        ],
      },
      { group: "Company", items: [{ label: "Company", value: "{{companyName}}" }] },
      {
        group: "Sender",
        items: [
          { label: "Sender first name", value: "{{senderFirstName}}" },
          { label: "Sender last name", value: "{{senderLastName}}" },
          { label: "Sender full name", value: "{{senderFullName}}" },
          { label: "Sender email", value: "{{senderEmail}}" },
        ],
      },
      {
        group: "Custom",
        items: customVariables.map((v) => ({ label: v.label, value: `{{${v.key}}}` })),
      },
    ],
    [customVariables],
  );

  async function addStep(kind: string, branch?: { condition: string }) {
    setPendingAdd(true);
    try {
      // Anchor: after the selected step, or at the end of the root lane.
      const lastRoot = steps
        .filter((s) => !s.parent_step_id && !s.branch_path)
        .sort((a, b) => a.position - b.position)
        .at(-1);
      const anchor = selected ?? lastRoot ?? null;
      if (branch && anchor) {
        // Create the first step of BOTH lanes so the fork is visible.
        const yes = await addStepAction({
          sequenceId: sequence.id,
          parentStepId: anchor.id,
          branchPath: "yes",
          branchCondition: branch.condition,
          kind,
        });
        const no = await addStepAction({
          sequenceId: sequence.id,
          parentStepId: anchor.id,
          branchPath: "no",
          branchCondition: branch.condition,
          kind,
        });
        if (!yes.ok || !no.ok) {
          toast.actionFailed("Couldn't add branch", (!yes.ok ? yes.error : "") || (!no.ok ? no.error : ""));
          return;
        }
        toast.actionOk("Branch added");
      } else {
        const res = await addStepAction({
          sequenceId: sequence.id,
          afterStepId: anchor?.parent_step_id || anchor?.branch_path ? anchor?.id : anchor?.id ?? null,
          parentStepId: anchor?.parent_step_id ?? null,
          branchPath: (anchor?.branch_path as "yes" | "no" | null) ?? null,
          kind,
        });
        if (!res.ok) {
          toast.actionFailed("Couldn't add step", res.error);
          return;
        }
        setSelectedId(res.data.id);
        toast.actionOk("Step added");
      }
      router.refresh();
    } finally {
      setPendingAdd(false);
      setAddOpen(false);
      setBranchOpen(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <Link
          href={`/sequences/${sequence.id}`}
          className="rounded-md border border-border p-1.5 hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-sm font-semibold">Sequence Editor</p>
          <p className="text-xs text-muted-foreground">
            {sequence.name}
            <span className="ml-1.5 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase">
              {sequence.status}
            </span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            title={
              hasEnrollments ? "Cannot change mode with active enrollments" : undefined
            }
            className={`rounded-full border border-border px-2 py-0.5 text-xs capitalize ${
              hasEnrollments ? "opacity-50" : ""
            }`}
          >
            {sequence.mode} mode
          </span>
          <div className="relative">
            <button
              type="button"
              disabled={pendingAdd}
              onClick={() => {
                setAddOpen((o) => !o);
                setBranchOpen(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add a step
            </button>
            {addOpen ? (
              <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-card p-1 shadow-md">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {selected ? "After selected step" : "At the end"}
                </p>
                {ADDABLE_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => void addStep(kind)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className={KIND_META[kind]?.accent}>{kindIcon(kind)}</span>
                    {KIND_META[kind]?.label ?? kind}
                  </button>
                ))}
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setBranchOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Add branch (Yes/No condition)
                </button>
              </div>
            ) : null}
            {branchOpen ? (
              <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-card p-1 shadow-md">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Branch on…
                </p>
                {CONDITIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => void addStep("linkedin_message", { condition: c.key })}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    {c.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            href={`/sequences/${sequence.id}`}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Close
          </Link>
        </div>
      </div>

      {/* Canvas + panel */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              if (node.type === "step") setSelectedId(node.id);
            }}
            onPaneClick={() => setSelectedId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Background gap={16} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {selected ? (
          <StepConfigPanel
            key={selected.id}
            step={selected}
            accounts={accounts}
            templates={templates}
            variableGroups={variableGroups}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="hidden w-[360px] shrink-0 items-center justify-center border-l border-border bg-card p-6 text-center text-sm text-muted-foreground lg:flex">
            {steps.length === 0
              ? "Add your first step to start building the sequence."
              : "Select a step on the canvas to configure it."}
          </div>
        )}
      </div>
    </div>
  );
}
