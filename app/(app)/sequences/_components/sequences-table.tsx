"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  Copy,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { toast } from "@/lib/toast";
import {
  deleteSequenceAction,
  duplicateSequenceAction,
  updateSequenceAction,
} from "../../_actions/sequences";

export type SequenceListRow = {
  id: string;
  name: string;
  status: string;
  priority: number;
  total: number;
  active: number;
  replied: number;
  sent: number;
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success/10 text-success border-success/30",
  paused: "bg-warning/10 text-warning border-warning/30",
  draft: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted text-muted-foreground border-border",
};

export function SequencesTable({
  rows,
  statusCounts,
  activeStatus,
  q,
}: {
  rows: SequenceListRow[];
  statusCounts: { all: number; active: number; paused: number; draft: number };
  activeStatus: string | null;
  q: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);

  function applyFilters(next: { status?: string | null; q?: string }) {
    const params = new URLSearchParams();
    const status = next.status === undefined ? activeStatus : next.status;
    const query = next.q === undefined ? search : next.q;
    if (status) params.set("status", status);
    if (query) params.set("q", query);
    const qs = params.toString();
    router.replace(qs ? `/sequences?${qs}` : "/sequences");
  }

  const pills: Array<{ key: string | null; label: string; count: number }> = [
    { key: null, label: "All", count: statusCounts.all },
    { key: "active", label: "Active", count: statusCounts.active },
    { key: "paused", label: "Paused", count: statusCounts.paused },
    { key: "draft", label: "Draft", count: statusCounts.draft },
  ];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters({ q: search });
            }}
            placeholder="Search by name…"
            className="h-8 w-64 rounded-md border border-border bg-card pl-8 pr-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {pills.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyFilters({ status: p.key })}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                activeStatus === p.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label} ({p.count})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Progress</th>
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium">Replied</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No sequences yet. Create your first one to start outreach from the ATS.
                </td>
              </tr>
            ) : (
              rows.map((row) => <Row key={row.id} row={row} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row }: { row: SequenceListRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const finishedPct = row.total > 0 ? Math.round(((row.total - row.active) / row.total) * 100) : 0;
  const repliedPct = row.total > 0 ? Math.round((row.replied / row.total) * 100) : 0;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.actionFailed("Action failed", res.error ?? "");
        return;
      }
      toast.actionOk(okMsg);
      router.refresh();
    });
  }

  return (
    <tr className="group hover:bg-muted/50">
      <td className="px-3 py-2.5">
        <Link href={`/sequences/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${
            STATUS_BADGE[row.status] ?? STATUS_BADGE.draft
          }`}
        >
          {row.status}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground/70" style={{ width: `${finishedPct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {row.total - row.active}/{row.total}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{row.sent}</td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {row.replied} ({repliedPct}%)
      </td>
      <td className="px-3 py-2.5 text-right">
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label="Sequence actions"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              align="end"
              className="z-50 min-w-[180px] rounded-md border border-border bg-card p-1 text-sm shadow-md"
            >
              {row.status === "active" ? (
                <Item
                  icon={<Pause className="h-3.5 w-3.5" />}
                  label="Pause"
                  onSelect={() =>
                    run(
                      () => updateSequenceAction({ sequenceId: row.id, patch: { status: "paused" } }),
                      "Sequence paused",
                    )
                  }
                />
              ) : (
                <Item
                  icon={<Play className="h-3.5 w-3.5" />}
                  label="Activate"
                  onSelect={() =>
                    run(
                      () => updateSequenceAction({ sequenceId: row.id, patch: { status: "active" } }),
                      "Sequence activated",
                    )
                  }
                />
              )}
              <Item
                icon={<Pencil className="h-3.5 w-3.5" />}
                label="Edit sequence"
                onSelect={() => router.push(`/sequences/${row.id}/editor`)}
              />
              <Item
                icon={<Copy className="h-3.5 w-3.5" />}
                label="Duplicate"
                onSelect={() =>
                  run(() => duplicateSequenceAction({ sequenceId: row.id }), "Sequence duplicated")
                }
              />
              <PrioritySub
                onPick={(priority) =>
                  run(
                    () => updateSequenceAction({ sequenceId: row.id, patch: { priority } }),
                    "Priority updated",
                  )
                }
              />
              <Item
                icon={<Archive className="h-3.5 w-3.5" />}
                label="Archive"
                onSelect={() =>
                  run(
                    () => updateSequenceAction({ sequenceId: row.id, patch: { status: "archived" } }),
                    "Sequence archived",
                  )
                }
              />
              <Dropdown.Separator className="my-1 h-px bg-border" />
              <Item
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="Delete"
                destructive
                onSelect={() => {
                  if (!window.confirm(`Delete sequence "${row.name}"? This cannot be undone.`)) return;
                  run(() => deleteSequenceAction({ sequenceId: row.id }), "Sequence deleted");
                }}
              />
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </td>
    </tr>
  );
}

function Item({
  icon,
  label,
  onSelect,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}) {
  return (
    <Dropdown.Item
      onSelect={onSelect}
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted ${
        destructive ? "text-destructive" : ""
      }`}
    >
      {icon}
      {label}
    </Dropdown.Item>
  );
}

function PrioritySub({ onPick }: { onPick: (priority: number) => void }) {
  return (
    <Dropdown.Sub>
      <Dropdown.SubTrigger className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted">
        <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        Priority
      </Dropdown.SubTrigger>
      <Dropdown.Portal>
        <Dropdown.SubContent className="z-50 min-w-[120px] rounded-md border border-border bg-card p-1 text-sm shadow-md">
          {[
            { label: "High", value: 10 },
            { label: "Normal", value: 0 },
            { label: "Low", value: -10 },
          ].map((p) => (
            <Dropdown.Item
              key={p.label}
              onSelect={() => onPick(p.value)}
              className="cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted"
            >
              {p.label}
            </Dropdown.Item>
          ))}
        </Dropdown.SubContent>
      </Dropdown.Portal>
    </Dropdown.Sub>
  );
}
