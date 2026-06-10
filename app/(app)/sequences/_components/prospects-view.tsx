"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Kanban,
  Linkedin,
  Loader2,
  Plus,
  Search,
  Table2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  enrollCandidatesAction,
  setEnrollmentStatusAction,
} from "../../_actions/sequences";
import { searchCandidatesForLinkAction } from "../../_actions/conversations";
import type { BoardStage } from "@/lib/sequences/engine";

export type StepOption = { id: string; label: string };

export type ProspectRow = {
  enrollmentId: string;
  candidateId: string;
  name: string;
  headline: string | null;
  hasLinkedin: boolean;
  status: string;
  enrolledAt: string | null;
  nextRunAt: string | null;
  currentStepLabel: string | null;
  lastStep: string | null;
  lastStepAt: string | null;
  sent: number;
  boardStage: BoardStage;
};

const BOARD_COLUMNS: Array<{ key: BoardStage; label: string; dot: string }> = [
  { key: "pending", label: "Pending", dot: "bg-warning" },
  { key: "not_contacted", label: "Not Contacted", dot: "bg-orange-400" },
  { key: "in_progress", label: "In Progress", dot: "bg-violet-400" },
  { key: "replied", label: "Replied", dot: "bg-success" },
  { key: "finished", label: "Finished", dot: "bg-muted-foreground" },
];

const STATUS_BADGE: Record<string, string> = {
  active: "bg-muted text-foreground border-border",
  replied: "bg-success/10 text-success border-success/30",
  completed: "bg-muted text-muted-foreground border-border",
  paused: "bg-warning/10 text-warning border-warning/30",
  unsubscribed: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
};

export function ProspectsView({
  sequenceId,
  prospects,
  stepOptions,
}: {
  sequenceId: string;
  prospects: ProspectRow[];
  stepOptions: StepOption[];
}) {
  const [view, setView] = useState<"table" | "board">("table");
  const [search, setSearch] = useState("");
  const [stepFilter, setStepFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "finished" | "replied">("all");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    let rows = prospects;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(q) || (r.headline ?? "").toLowerCase().includes(q),
      );
    }
    if (stepFilter) rows = rows.filter((r) => r.currentStepLabel === stepOptions.find((s) => s.id === stepFilter)?.label);
    if (statusFilter === "finished") rows = rows.filter((r) => r.status === "completed");
    if (statusFilter === "replied") rows = rows.filter((r) => r.status === "replied");
    return rows;
  }, [prospects, search, stepFilter, statusFilter, stepOptions]);

  const counts = {
    all: prospects.length,
    finished: prospects.filter((r) => r.status === "completed").length,
    replied: prospects.filter((r) => r.status === "replied").length,
  };

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
            placeholder="Search by name, headline…"
            className="h-8 w-64 rounded-md border border-border bg-card pl-8 pr-2 text-sm"
          />
        </div>
        <select
          value={stepFilter}
          onChange={(e) => setStepFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="">All steps</option>
          {stepOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {(
          [
            { key: "all", label: `All statuses (${counts.all})` },
            { key: "finished", label: `Finished (${counts.finished})` },
            { key: "replied", label: `Replied (${counts.replied})` },
          ] as const
        ).map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setStatusFilter(p.key)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              statusFilter === p.key
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => setView("table")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs ${
                view === "table" ? "bg-foreground text-background" : "bg-card hover:bg-muted"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setView("board")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs ${
                view === "board" ? "bg-foreground text-background" : "bg-card hover:bg-muted"
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              Board
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            {addOpen ? <X className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            {addOpen ? "Close" : "Add Contact"}
          </button>
        </div>
      </div>

      {addOpen ? <AddContactPanel sequenceId={sequenceId} onDone={() => setAddOpen(false)} /> : null}

      <div className="mt-3">
        {view === "table" ? <ProspectsTable rows={filtered} /> : <ProspectsBoard rows={filtered} />}
      </div>
    </div>
  );
}

function ProspectsTable({ rows }: { rows: ProspectRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Last Step</th>
            <th className="px-3 py-2 font-medium">Next Step</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Sent</th>
            <th className="px-3 py-2 font-medium">Added</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                No contacts match.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.enrollmentId} className="hover:bg-muted/50">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/candidates?candidate=${r.candidateId}`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.hasLinkedin ? <Linkedin className="h-3 w-3 text-muted-foreground" /> : null}
                  </div>
                  {r.headline ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.headline}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {r.lastStep ?? "—"}
                  {r.lastStepAt ? (
                    <span className="ml-1">
                      ·{" "}
                      {new Date(r.lastStepAt).toLocaleDateString("es-MX", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {r.status === "active" ? r.currentStepLabel ?? "—" : "—"}
                  {r.status === "active" && r.nextRunAt ? (
                    <span className="ml-1">
                      ·{" "}
                      {new Date(r.nextRunAt).toLocaleDateString("es-MX", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${
                      STATUS_BADGE[r.status] ?? STATUS_BADGE.active
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.sent}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {r.enrolledAt
                    ? new Date(r.enrolledAt).toLocaleDateString("es-MX", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProspectsBoard({ rows }: { rows: ProspectRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  function dropTo(stage: BoardStage) {
    if (!dragId) return;
    if (stage !== "replied" && stage !== "finished") {
      toast.actionFailed(
        "Stage is derived automatically",
        "Drag to Replied or Finished to override; other stages follow the sequence run.",
      );
      setDragId(null);
      return;
    }
    const enrollmentId = dragId;
    setDragId(null);
    startTransition(async () => {
      const res = await setEnrollmentStatusAction({
        enrollmentId,
        status: stage === "replied" ? "replied" : "completed",
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't move contact", res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {BOARD_COLUMNS.map((col) => {
        const cards = rows.filter((r) => r.boardStage === col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropTo(col.key)}
            className="rounded-md border border-border bg-card p-2"
          >
            <div className="flex items-center gap-1.5 px-1 py-1">
              <span className={`h-2 w-2 rounded-full ${col.dot}`} />
              <span className="text-xs font-medium">{col.label}</span>
              <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                {cards.length}
              </span>
            </div>
            <div className="mt-1 space-y-1.5">
              {cards.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  No contacts in this stage
                </p>
              ) : (
                cards.map((r) => (
                  <div
                    key={r.enrollmentId}
                    draggable
                    onDragStart={() => setDragId(r.enrollmentId)}
                    className="cursor-grab rounded-md border border-border bg-background px-2 py-1.5 active:cursor-grabbing"
                  >
                    <p className="truncate text-xs font-medium">{r.name}</p>
                    {r.headline ? (
                      <p className="truncate text-[11px] text-muted-foreground">{r.headline}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddContactPanel({ sequenceId, onDone }: { sequenceId: string; onDone: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; headline: string | null }>>([]);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [pending, startTransition] = useTransition();

  function searchNow(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    void searchCandidatesForLinkAction({ query: q }).then((res) => {
      if (res.ok) setResults(res.data.items);
    });
  }

  function enroll() {
    const ids = [...selected.keys()];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await enrollCandidatesAction({ sequenceId, candidateIds: ids });
      if (!res.ok) {
        toast.actionFailed("Couldn't enroll", res.error);
        return;
      }
      const { enrolled, failed } = res.data;
      if (failed.length > 0) {
        toast.actionFailed(
          `Enrolled ${enrolled}, ${failed.length} failed`,
          failed.map((f) => f.error)[0] ?? "",
        );
      } else {
        toast.actionOk(`Enrolled ${enrolled} contact${enrolled === 1 ? "" : "s"}`);
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-card p-3">
      <input
        type="text"
        value={query}
        onChange={(e) => searchNow(e.target.value)}
        placeholder="Search candidates by name…"
        autoFocus
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {results.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-muted">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Map(prev);
                      if (e.target.checked) next.set(r.id, r.name);
                      else next.delete(r.id);
                      return next;
                    })
                  }
                />
                <span className="truncate">{r.name}</span>
                {r.headline ? (
                  <span className="ml-auto truncate text-xs text-muted-foreground">{r.headline}</span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {selected.size > 0 ? (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {selected.size} selected: {[...selected.values()].slice(0, 4).join(", ")}
            {selected.size > 4 ? "…" : ""}
          </p>
          <button
            type="button"
            onClick={enroll}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Enroll
          </button>
        </div>
      ) : null}
    </div>
  );
}
