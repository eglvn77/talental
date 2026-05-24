"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import {
  formatRelative,
  MultiSelectFilter,
  SortHeader,
  useTableSort,
} from "../../_components/table-controls";

type Row = {
  application: ApplicationRow;
  candidate: CandidateRow | null;
  stage: PipelineStageRow | null;
  tags: TagRow[];
};

type SortKey = "name" | "stage" | "source" | "activity";

const SOURCE_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  referral: "Referido",
  direct: "Directo",
  other: "Otro",
  bulk_import: "Importado Manualmente",
};

export function CandidatesListView({
  stages,
  applications,
  candidatesById,
  tagsByApplicationId,
  selectedStageId,
  hiddenCols,
}: {
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
  tagsByApplicationId: Record<string, TagRow[]>;
  /**
   * Currently-selected stage id from the parent's <StageChips>, or
   * null for "Todas". The list filters to this single stage; the
   * old inline "Etapa" filter chip was removed because the chips do
   * the same job with counts visible.
   */
  selectedStageId: string | null;
  /**
   * Set of toggleable column keys currently hidden. Controlled by
   * the parent's <VistaPopover>. Keys: stage / source / tags /
   * activity / email. The "Nombre" column is locked.
   */
  hiddenCols: Set<string>;
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

  // Filter state — Etapa is now driven by the StageChips row in the
  // parent (selectedStageId). Tags + Fuente stay as inline filters.
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());

  // Sort state — string keys start ascending; everything else descending.
  const [sort, toggleSort] = useTableSort<SortKey>(
    { key: "activity", dir: "desc" },
    ["name", "source"],
  );

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
      if (selectedStageId != null) {
        if (r.application.stage_id !== selectedStageId) return false;
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
  }, [rows, selectedStageId, sourceFilter, tagFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") {
        cmp = (a.candidate?.full_name ?? "").localeCompare(
          b.candidate?.full_name ?? "",
        );
      } else if (sort.key === "stage") {
        const ai = a.stage?.position ?? Infinity;
        const bi = b.stage?.position ?? Infinity;
        cmp = ai - bi;
      } else if (sort.key === "source") {
        cmp = a.application.source.localeCompare(b.application.source);
      } else {
        cmp =
          new Date(a.application.status_changed_at).getTime() -
          new Date(b.application.status_changed_at).getTime();
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  function openCandidate(id: string) {
    router.push(`?contact=${id}`, { scroll: false });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
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

      {(() => {
        const showStage = !hiddenCols.has("stage");
        const showSource = !hiddenCols.has("source");
        const showTags = !hiddenCols.has("tags");
        const showActivity = !hiddenCols.has("activity");
        const showEmail = !hiddenCols.has("email");
        const colCount =
          1 + // Nombre (locked)
          (showStage ? 1 : 0) +
          (showSource ? 1 : 0) +
          (showTags ? 1 : 0) +
          (showActivity ? 1 : 0) +
          (showEmail ? 1 : 0);
        return (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                <tr>
                  <SortHeader
                    label="Nombre"
                    k="name"
                    state={sort}
                    onToggle={toggleSort}
                  />
                  {showStage ? (
                    <SortHeader
                      label="Etapa"
                      k="stage"
                      state={sort}
                      onToggle={toggleSort}
                    />
                  ) : null}
                  {showEmail ? (
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                  ) : null}
                  {showSource ? (
                    <SortHeader
                      label="Fuente"
                      k="source"
                      state={sort}
                      onToggle={toggleSort}
                    />
                  ) : null}
                  {showTags ? (
                    <th className="px-3 py-2 text-left font-medium">Tags</th>
                  ) : null}
                  {showActivity ? (
                    <SortHeader
                      label="Última actividad"
                      k="activity"
                      state={sort}
                      onToggle={toggleSort}
                    />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="px-3 py-8 text-center text-xs text-muted-foreground"
                    >
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
                        {r.candidate?.email && !showEmail ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            {r.candidate.email}
                          </div>
                        ) : null}
                      </td>
                      {showStage ? (
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
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                      ) : null}
                      {showEmail ? (
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.candidate?.email ?? "—"}
                        </td>
                      ) : null}
                      {showSource ? (
                        <td className="px-3 py-2 text-xs">
                          {SOURCE_LABEL[r.application.source] ??
                            r.application.source}
                        </td>
                      ) : null}
                      {showTags ? (
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
                      ) : null}
                      {showActivity ? (
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatRelative(r.application.status_changed_at)}
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
