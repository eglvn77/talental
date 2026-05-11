"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";

type Row = {
  application: ApplicationRow;
  candidate: CandidateRow | null;
  stage: PipelineStageRow | null;
  tags: TagRow[];
};

type SortKey = "name" | "stage" | "source" | "activity";
type SortDir = "asc" | "desc";

const SOURCE_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  referral: "Referido",
  direct: "Directo",
  other: "Otro",
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "hace unos segundos";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `hace ${diffDay} día${diffDay === 1 ? "" : "s"}`;
  const diffMon = Math.round(diffDay / 30);
  if (diffMon < 12) return `hace ${diffMon} mes${diffMon === 1 ? "" : "es"}`;
  const diffYr = Math.round(diffMon / 12);
  return `hace ${diffYr} año${diffYr === 1 ? "" : "s"}`;
}

export function CandidatesListView({
  stages,
  applications,
  candidatesById,
  tagsByApplicationId,
}: {
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
  tagsByApplicationId: Record<string, TagRow[]>;
}) {
  const router = useRouter();
  const stagesById = useMemo(() => {
    const m = new Map<string, PipelineStageRow>();
    for (const s of stages) m.set(s.id, s);
    return m;
  }, [stages]);

  const rows: Row[] = useMemo(
    () =>
      applications.map((a) => ({
        application: a,
        candidate: candidatesById[a.candidate_id] ?? null,
        stage: a.stage_id ? stagesById.get(a.stage_id) ?? null : null,
        tags: tagsByApplicationId[a.id] ?? [],
      })),
    [applications, candidatesById, tagsByApplicationId, stagesById],
  );

  // Filter state
  const [stageFilter, setStageFilter] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Collect all distinct values for filter dropdowns
  const allSources = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.application.source);
    return Array.from(s);
  }, [rows]);

  const allTags = useMemo(() => {
    const m = new Map<string, TagRow>();
    for (const r of rows) for (const t of r.tags) m.set(t.id, t);
    return Array.from(m.values());
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (stageFilter.size > 0) {
        const sid = r.application.stage_id;
        if (!sid || !stageFilter.has(sid)) return false;
      }
      if (sourceFilter.size > 0 && !sourceFilter.has(r.application.source)) {
        return false;
      }
      if (tagFilter.size > 0) {
        const has = r.tags.some((t) => tagFilter.has(t.id));
        if (!has) return false;
      }
      return true;
    });
  }, [rows, stageFilter, sourceFilter, tagFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = (a.candidate?.full_name ?? "").localeCompare(
          b.candidate?.full_name ?? "",
        );
      } else if (sortKey === "stage") {
        const ai = a.stage?.position ?? Infinity;
        const bi = b.stage?.position ?? Infinity;
        cmp = ai - bi;
      } else if (sortKey === "source") {
        cmp = a.application.source.localeCompare(b.application.source);
      } else {
        cmp =
          new Date(a.application.status_changed_at).getTime() -
          new Date(b.application.status_changed_at).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" || k === "source" ? "asc" : "desc");
    }
  }

  function openCandidate(id: string) {
    router.push(`?contact=${id}`, { scroll: false });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Etapa"
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
          selected={stageFilter}
          onChange={setStageFilter}
        />
        <MultiSelectFilter
          label="Tags"
          options={allTags.map((t) => ({ value: t.id, label: t.name }))}
          selected={tagFilter}
          onChange={setTagFilter}
        />
        <MultiSelectFilter
          label="Fuente"
          options={allSources.map((s) => ({
            value: s,
            label: SOURCE_LABEL[s] ?? s,
          }))}
          selected={sourceFilter}
          onChange={setSourceFilter}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {sorted.length} de {rows.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th label="Nombre" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th label="Etapa" k="stage" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th label="Fuente" k="source" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th className="px-3 py-2 text-left font-medium">Tags</th>
              <Th label="Última actividad" k="activity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No hay candidatos que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr
                  key={r.application.id}
                  onClick={() => openCandidate(r.application.id)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-2 font-medium">
                    {r.candidate?.full_name ?? "Sin nombre"}
                    {r.candidate?.email ? (
                      <div className="text-xs font-normal text-muted-foreground">
                        {r.candidate.email}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {r.stage ? (
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: (r.stage.color ?? "#94a3b8") + "22",
                          color: r.stage.color ?? "#475569",
                        }}
                      >
                        {r.stage.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {SOURCE_LABEL[r.application.source] ?? r.application.source}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            background: (t.color ?? "#94a3b8") + "22",
                            color: t.color ?? "#475569",
                          }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {r.tags.length > 3 ? (
                        <span className="text-[10px] text-muted-foreground">
                          +{r.tags.length - 3}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatRelative(r.application.status_changed_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-3 py-2 text-left font-medium">
      <button
        type="button"
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  const count = selected.size;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted",
          count > 0 && "border-foreground/30",
        )}
      >
        {label}
        {count > 0 ? (
          <span className="rounded bg-muted px-1.5 text-[10px]">{count}</span>
        ) : null}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-lg">
            {options.map((o) => {
              const checked = selected.has(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(o.value);
                      else next.add(o.value);
                      onChange(next);
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              );
            })}
            {count > 0 ? (
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={() => onChange(new Set())}
                  className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                >
                  Limpiar
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
