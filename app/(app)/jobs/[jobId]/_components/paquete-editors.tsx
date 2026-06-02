"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type {
  AIInterviewCategory,
  AIInterviewCriterion,
  ApplicationQuestion,
  JobHiringProcessStep,
} from "@/lib/hiring";
import { updateJobAction } from "@/app/(app)/actions";

// Stable client id attached to each editable row so dnd-kit and React
// keys survive reorder/edit. The persist layer strips it before saving.
type WithId<T> = T & { _id: string };

function uid(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Shared sortable list shell — drag handle + keyboard up/down + remove on each
// row, an "add" button below. Generic over the row's stable `_id`.
// ---------------------------------------------------------------------------

export function SortableList<T extends { _id: string }>({
  items,
  onReorder,
  onRemove,
  onAdd,
  addLabel,
  emptyLabel,
  renderItem,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  addLabel: string;
  emptyLabel: string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = items.findIndex((i) => i._id === active.id);
    const newI = items.findIndex((i) => i._id === over.id);
    if (oldI < 0 || newI < 0) return;
    onReorder(arrayMove(items, oldI, newI));
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        emptyLabel ? (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        ) : null
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i._id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {items.map((item, i) => (
                <SortableCard
                  key={item._id}
                  id={item._id}
                  canUp={i > 0}
                  canDown={i < items.length - 1}
                  onUp={() => onReorder(arrayMove(items, i, i - 1))}
                  onDown={() => onReorder(arrayMove(items, i, i + 1))}
                  onRemove={() => onRemove(item._id)}
                >
                  {renderItem(item, i)}
                </SortableCard>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        {addLabel}
      </button>
    </div>
  );
}

function SortableCard({
  id,
  canUp,
  canDown,
  onUp,
  onDown,
  onRemove,
  children,
}: {
  id: string;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-bg-1 p-3",
        isDragging && "opacity-60",
      )}
    >
      {/* Drag handle + keyboard-friendly arrows. */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={t("kickoff.dragToReorder")}
          title={t("kickoff.dragToReorder")}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onUp}
          disabled={!canUp}
          aria-label={t("kickoff.moveUp")}
          title={t("kickoff.moveUp")}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={!canDown}
          aria-label={t("kickoff.moveDown")}
          title={t("kickoff.moveDown")}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("kickoff.remove")}
        title={t("kickoff.remove")}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// Small labelled field helpers — full-width inputs so long content is
// readable on the whole row.
function FieldInput({
  label,
  value,
  placeholder,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
      />
    </label>
  );
}

function FieldTextarea({
  label,
  value,
  placeholder,
  onChange,
  onCommit,
  rows = 2,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        rows={rows}
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm leading-relaxed"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// 1. Hiring process editor (hiring_process)
// ---------------------------------------------------------------------------

export function ProcessEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: JobHiringProcessStep[];
}) {
  const t = useT();
  const [rows, setRows] = useState<WithId<JobHiringProcessStep>[]>(() =>
    initial.map((s) => ({ ...s, _id: uid() })),
  );
  const [, start] = useTransition();

  function persist(next: WithId<JobHiringProcessStep>[]) {
    setRows(next);
    start(async () => {
      const res = await updateJobAction({
        jobId,
        hiringProcess: next.map(({ _id, ...s }) => s),
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function patch(id: string, field: keyof JobHiringProcessStep, value: string) {
    setRows((cur) =>
      cur.map((r) => (r._id === id ? { ...r, [field]: value } : r)),
    );
  }

  return (
    <SortableList
      items={rows}
      onReorder={persist}
      onRemove={(id) => persist(rows.filter((r) => r._id !== id))}
      onAdd={() =>
        setRows((cur) => [
          ...cur,
          { _id: uid(), order: cur.length + 1, who: "", focus: "", format: "" },
        ])
      }
      addLabel={t("kickoff.addStep")}
      emptyLabel={t("kickoff.procEmpty")}
      renderItem={(r) => (
        <div className="space-y-2">
          <FieldInput
            label={t("kickoff.procWho")}
            value={r.who ?? ""}
            placeholder={t("kickoff.procWhoPlaceholder")}
            onChange={(v) => patch(r._id, "who", v)}
            onCommit={() => persist(rows)}
          />
          <FieldInput
            label={t("kickoff.procFocus")}
            value={r.focus ?? ""}
            placeholder={t("kickoff.procFocusPlaceholder")}
            onChange={(v) => patch(r._id, "focus", v)}
            onCommit={() => persist(rows)}
          />
          <FieldInput
            label={t("kickoff.procFormat")}
            value={r.format ?? ""}
            placeholder={t("kickoff.procFormatPlaceholder")}
            onChange={(v) => patch(r._id, "format", v)}
            onCommit={() => persist(rows)}
          />
        </div>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// 2. Application questions editor (screening_questions, ApplicationQuestion[])
// ---------------------------------------------------------------------------

export function AppQuestionsEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: ApplicationQuestion[];
}) {
  const t = useT();
  const [rows, setRows] = useState<WithId<ApplicationQuestion>[]>(() =>
    initial.map((q) => ({ ...q, _id: uid() })),
  );
  const [, start] = useTransition();

  function persist(next: WithId<ApplicationQuestion>[]) {
    setRows(next);
    start(async () => {
      const res = await updateJobAction({
        jobId,
        applicationQuestions: next.map(({ _id, ...q }) => q),
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function patch(
    id: string,
    field: keyof ApplicationQuestion,
    value: string,
  ) {
    setRows((cur) =>
      cur.map((r) => (r._id === id ? { ...r, [field]: value } : r)),
    );
  }

  return (
    <SortableList
      items={rows}
      onReorder={persist}
      onRemove={(id) => persist(rows.filter((r) => r._id !== id))}
      onAdd={() =>
        setRows((cur) => [
          ...cur,
          {
            _id: uid(),
            question: "",
            requirement: "",
            type: "preferential",
            auto_reject_rule: null,
          },
        ])
      }
      addLabel={t("kickoff.addQuestion")}
      emptyLabel={t("kickoff.appqEmpty")}
      renderItem={(r) => (
        <div className="space-y-2">
          <FieldTextarea
            label={t("kickoff.appqQuestion")}
            value={r.question ?? ""}
            placeholder={t("kickoff.appqQuestionPlaceholder")}
            onChange={(v) => patch(r._id, "question", v)}
            onCommit={() => persist(rows)}
          />
          <FieldInput
            label={t("kickoff.appqRequirement")}
            value={r.requirement ?? ""}
            placeholder={t("kickoff.appqRequirementPlaceholder")}
            onChange={(v) => patch(r._id, "requirement", v)}
            onCommit={() => persist(rows)}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr]">
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("kickoff.appqType")}
              </span>
              <select
                value={r.type}
                onChange={(e) => {
                  patch(r._id, "type", e.target.value);
                  // selects don't blur on every platform — persist now.
                  persist(
                    rows.map((x) =>
                      x._id === r._id
                        ? { ...x, type: e.target.value as ApplicationQuestion["type"] }
                        : x,
                    ),
                  );
                }}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="eliminatory">
                  {t("kickoff.questionEliminatory")}
                </option>
                <option value="preferential">
                  {t("kickoff.questionPreferential")}
                </option>
              </select>
            </label>
            <FieldInput
              label={t("kickoff.appqAutoReject")}
              value={r.auto_reject_rule ?? ""}
              placeholder={t("kickoff.appqAutoRejectPlaceholder")}
              onChange={(v) => patch(r._id, "auto_reject_rule", v)}
              onCommit={() => persist(rows)}
            />
          </div>
        </div>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// 3. AI interview editor (interview_questions, AIInterviewCategory[]) — each
//    category carries a nested, independently reorderable criteria list.
// ---------------------------------------------------------------------------

type CritRow = WithId<AIInterviewCriterion>;
type CatRow = WithId<Omit<AIInterviewCategory, "criteria">> & {
  criteria: CritRow[];
};

export function AiInterviewEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: AIInterviewCategory[];
}) {
  const t = useT();
  const [cats, setCats] = useState<CatRow[]>(() =>
    initial.map((c) => ({
      ...c,
      _id: uid(),
      criteria: (c.criteria ?? []).map((cr) => ({ ...cr, _id: uid() })),
    })),
  );
  const [, start] = useTransition();

  function persist(next: CatRow[]) {
    setCats(next);
    start(async () => {
      const res = await updateJobAction({
        jobId,
        aiInterviewQuestions: next.map(({ _id, criteria, ...c }) => ({
          ...c,
          criteria: criteria.map(({ _id: _cid, ...cr }) => cr),
        })),
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function patchCat(id: string, field: "category" | "description", value: string) {
    setCats((cur) =>
      cur.map((c) => (c._id === id ? { ...c, [field]: value } : c)),
    );
  }

  function patchCrit(
    catId: string,
    critId: string,
    field: keyof AIInterviewCriterion,
    // string for the text fields (name/question/strong/weak/rationale +
    // strong/weak_example_answer); string[] for probing_questions.
    value: string | string[],
  ) {
    setCats((cur) =>
      cur.map((c) =>
        c._id === catId
          ? {
              ...c,
              criteria: c.criteria.map((cr) =>
                cr._id === critId ? { ...cr, [field]: value } : cr,
              ),
            }
          : c,
      ),
    );
  }

  function setCritList(catId: string, list: CritRow[]) {
    persist(
      cats.map((c) => (c._id === catId ? { ...c, criteria: list } : c)),
    );
  }

  return (
    <SortableList
      items={cats}
      onReorder={persist}
      onRemove={(id) => persist(cats.filter((c) => c._id !== id))}
      onAdd={() =>
        setCats((cur) => [
          ...cur,
          { _id: uid(), category: "", description: "", criteria: [] },
        ])
      }
      addLabel={t("kickoff.addCategory")}
      emptyLabel={t("kickoff.aiEmpty")}
      renderItem={(c) => (
        <div className="space-y-2">
          <FieldInput
            label={t("kickoff.aiCategory")}
            value={c.category ?? ""}
            placeholder={t("kickoff.aiCategoryPlaceholder")}
            onChange={(v) => patchCat(c._id, "category", v)}
            onCommit={() => persist(cats)}
          />
          <FieldTextarea
            label={t("kickoff.aiDescription")}
            value={c.description ?? ""}
            placeholder={t("kickoff.aiDescriptionPlaceholder")}
            onChange={(v) => patchCat(c._id, "description", v)}
            onCommit={() => persist(cats)}
          />
          <div className="rounded-md border border-dashed border-border p-2">
            <SortableList
              items={c.criteria}
              onReorder={(list) => setCritList(c._id, list)}
              onRemove={(critId) =>
                setCritList(
                  c._id,
                  c.criteria.filter((cr) => cr._id !== critId),
                )
              }
              onAdd={() =>
                setCats((cur) =>
                  cur.map((x) =>
                    x._id === c._id
                      ? {
                          ...x,
                          criteria: [
                            ...x.criteria,
                            {
                              _id: uid(),
                              name: "",
                              question: "",
                              strong: "",
                              weak: "",
                              rationale: "",
                            },
                          ],
                        }
                      : x,
                  ),
                )
              }
              addLabel={t("kickoff.addCriterion")}
              emptyLabel={t("kickoff.aiEmpty")}
              renderItem={(cr) => (
                <div className="space-y-2">
                  <FieldInput
                    label={t("kickoff.aiCritName")}
                    value={cr.name ?? ""}
                    placeholder={t("kickoff.aiCritNamePlaceholder")}
                    onChange={(v) => patchCrit(c._id, cr._id, "name", v)}
                    onCommit={() => persist(cats)}
                  />
                  <FieldTextarea
                    label={t("kickoff.aiCritQuestion")}
                    value={cr.question ?? ""}
                    placeholder={t("kickoff.aiCritQuestionPlaceholder")}
                    onChange={(v) => patchCrit(c._id, cr._id, "question", v)}
                    onCommit={() => persist(cats)}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FieldTextarea
                      label={t("kickoff.aiCritStrong")}
                      value={cr.strong ?? ""}
                      placeholder={t("kickoff.aiCritStrongPlaceholder")}
                      onChange={(v) => patchCrit(c._id, cr._id, "strong", v)}
                      onCommit={() => persist(cats)}
                    />
                    <FieldTextarea
                      label={t("kickoff.aiCritWeak")}
                      value={cr.weak ?? ""}
                      placeholder={t("kickoff.aiCritWeakPlaceholder")}
                      onChange={(v) => patchCrit(c._id, cr._id, "weak", v)}
                      onCommit={() => persist(cats)}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FieldTextarea
                      label={t("kickoff.aiCritStrongExample")}
                      value={cr.strong_example_answer ?? ""}
                      placeholder={t("kickoff.aiCritStrongExamplePlaceholder")}
                      onChange={(v) =>
                        patchCrit(c._id, cr._id, "strong_example_answer", v)
                      }
                      onCommit={() => persist(cats)}
                    />
                    <FieldTextarea
                      label={t("kickoff.aiCritWeakExample")}
                      value={cr.weak_example_answer ?? ""}
                      placeholder={t("kickoff.aiCritWeakExamplePlaceholder")}
                      onChange={(v) =>
                        patchCrit(c._id, cr._id, "weak_example_answer", v)
                      }
                      onCommit={() => persist(cats)}
                    />
                  </div>
                  <FieldTextarea
                    label={t("kickoff.aiCritProbing")}
                    value={(cr.probing_questions ?? []).join("\n")}
                    placeholder={t("kickoff.aiCritProbingPlaceholder")}
                    onChange={(v) =>
                      patchCrit(
                        c._id,
                        cr._id,
                        "probing_questions",
                        v
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean),
                      )
                    }
                    onCommit={() => persist(cats)}
                  />
                  <FieldInput
                    label={t("kickoff.aiCritRationale")}
                    value={cr.rationale ?? ""}
                    placeholder={t("kickoff.aiCritRationalePlaceholder")}
                    onChange={(v) => patchCrit(c._id, cr._id, "rationale", v)}
                    onCommit={() => persist(cats)}
                  />
                </div>
              )}
            />
          </div>
        </div>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// 4. Talental interview script editor (interview_script.markdown)
// ---------------------------------------------------------------------------

export function ScriptEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: string;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [, start] = useTransition();

  function persist() {
    start(async () => {
      const res = await updateJobAction({ jobId, interviewScript: value });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={persist}
      placeholder={t("kickoff.scriptPlaceholder")}
      rows={20}
      className="w-full resize-y rounded-md border border-border bg-bg-1 p-3 font-mono text-xs leading-relaxed text-foreground"
    />
  );
}
