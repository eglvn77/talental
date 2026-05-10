"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  useDroppable,
} from "@dnd-kit/core";
import { useSortable, SortableContext } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import { moveApplicationToStageAction } from "../../actions";

type CardData = {
  application: ApplicationRow;
  candidate: CandidateRow | null;
  tags: TagRow[];
};

export function PipelineBoard({
  stages,
  applications,
  candidatesById: candidatesMap,
  tagsByApplicationId,
}: {
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
  tagsByApplicationId: Record<string, TagRow[]>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  // dnd-kit's aria-describedby uses a global counter that drifts between SSR
  // and client. Defer the DnD tree until after mount to avoid hydration noise.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const initialCards: CardData[] = useMemo(
    () =>
      applications.map((a) => ({
        application: a,
        candidate: candidatesMap[a.candidate_id] ?? null,
        tags: tagsByApplicationId[a.id] ?? [],
      })),
    [applications, candidatesMap, tagsByApplicationId],
  );

  // Optimistic state: list of cards with their (possibly-pending) stage_id.
  type OptAction =
    | { kind: "move"; applicationId: string; toStageId: string }
    | { kind: "revert"; cards: CardData[] };

  const [optimisticCards, applyOptimistic] = useOptimistic(
    initialCards,
    (state, action: OptAction) => {
      if (action.kind === "revert") return action.cards;
      return state.map((c) =>
        c.application.id === action.applicationId
          ? {
              ...c,
              application: { ...c.application, stage_id: action.toStageId },
            }
          : c,
      );
    },
  );

  const cardsByStage = useMemo(() => {
    const map = new Map<string, CardData[]>();
    for (const s of stages) map.set(s.id, []);
    const orphan: CardData[] = [];
    for (const c of optimisticCards) {
      if (c.application.stage_id && map.has(c.application.stage_id)) {
        map.get(c.application.stage_id)!.push(c);
      } else {
        orphan.push(c);
      }
    }
    return { byStage: map, orphan };
  }, [optimisticCards, stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const activeCard =
    activeId != null
      ? optimisticCards.find((c) => c.application.id === activeId) ?? null
      : null;

  function findStageOf(applicationId: string): string | null {
    return (
      optimisticCards.find((c) => c.application.id === applicationId)
        ?.application.stage_id ?? null
    );
  }


  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const applicationId = String(active.id);
    // `over.id` is either a stage id (column) or another card id.
    let targetStageId: string | null = null;
    if (typeof over.id === "string") {
      if (stages.some((s) => s.id === over.id)) {
        targetStageId = over.id;
      } else {
        // Hovering over another card → use that card's stage.
        const overCard = optimisticCards.find(
          (c) => c.application.id === over.id,
        );
        if (overCard?.application.stage_id) {
          targetStageId = overCard.application.stage_id;
        }
      }
    }
    if (!targetStageId) return;
    const currentStageId = findStageOf(applicationId);
    if (targetStageId === currentStageId) return;

    const snapshot = optimisticCards;
    startTransition(async () => {
      applyOptimistic({ kind: "move", applicationId, toStageId: targetStageId! });
      const res = await moveApplicationToStageAction(
        applicationId,
        targetStageId!,
      );
      if (!res.ok) {
        applyOptimistic({ kind: "revert", cards: snapshot });
      }
      router.refresh();
    });
  }

  // First paint: render a hooks-free skeleton with stage names + counts so
  // SSR and the initial client render produce identical HTML. After mount,
  // swap in the full DnD-wired board (Column/useSortable generate per-render
  // IDs that drift between server and client).
  if (!mounted) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const cards = cardsByStage.byStage.get(stage.id) ?? [];
          return (
            <div
              key={stage.id}
              className="flex h-[calc(100vh-280px)] w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30"
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: stage.color ?? "#94a3b8" }}
                />
                <span className="text-sm font-medium">{stage.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
                  {cards.length}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const board = (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const cards = cardsByStage.byStage.get(stage.id) ?? [];
        return <Column key={stage.id} stage={stage} cards={cards} />;
      })}
      {cardsByStage.orphan.length > 0 ? (
        <UnstageColumn cards={cardsByStage.orphan} />
      ) : null}
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {board}
      <DragOverlay>
        {activeCard ? <CardView card={activeCard} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  cards,
}: {
  stage: PipelineStageRow;
  cards: CardData[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className="flex h-[calc(100vh-280px)] w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: stage.color ?? "#94a3b8" }}
          />
          <span className="text-sm font-medium">{stage.name}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
            {cards.length}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto p-2 transition-colors",
          isOver && "bg-muted/60",
        )}
      >
        <SortableContext items={cards.map((c) => c.application.id)}>
          {cards.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
              Arrastra candidatos aquí
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {cards.map((c) => (
                <SortableCard key={c.application.id} card={c} />
              ))}
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function UnstageColumn({ cards }: { cards: CardData[] }) {
  return (
    <div className="flex h-[calc(100vh-280px)] w-72 shrink-0 flex-col rounded-lg border border-dashed border-border bg-muted/10">
      <div className="border-b border-border px-3 py-2 text-sm font-medium text-muted-foreground">
        Sin etapa · {cards.length}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {cards.map((c) => (
            <CardView key={c.application.id} card={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SortableCard({ card }: { card: CardData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.application.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardView card={card} />
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function avatarColor(name: string): string {
  // Deterministic pleasant color from the name.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 65% 55%)`;
}

function CardView({
  card,
  dragging,
}: {
  card: CardData;
  dragging?: boolean;
}) {
  const router = useRouter();
  const c = card.candidate;
  const name = c?.full_name ?? "Sin nombre";
  return (
    <button
      type="button"
      onClick={(e) => {
        // Avoid opening when this is mid-drag.
        if (dragging) return;
        e.stopPropagation();
        router.push(`?contact=${card.application.id}`, { scroll: false });
      }}
      className={cn(
        "group flex w-full cursor-grab items-start gap-2 rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow",
        dragging && "cursor-grabbing shadow-lg",
      )}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ background: avatarColor(name) }}
      >
        {initialsOf(name) || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        {c?.email ? (
          <div className="truncate text-xs text-muted-foreground">{c.email}</div>
        ) : c?.linkedin_url ? (
          <div className="truncate text-xs text-muted-foreground">
            {c.linkedin_url.replace(/^https?:\/\//, "")}
          </div>
        ) : null}
        {card.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {card.tags.slice(0, 3).map((t) => (
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
            {card.tags.length > 3 ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                +{card.tags.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {c?.linkedin_url ? (
        <a
          href={c.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open LinkedIn"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </a>
      ) : null}
    </button>
  );
}
