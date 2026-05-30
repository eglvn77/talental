"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  useDroppable,
  type DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { useSortable, SortableContext } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type {
  CompanyRow,
  ContactRow,
  DealRow,
  DealStage,
} from "@/lib/hiring";
import { CompanyLogo } from "@/components/company-logo";
import { Pill, type PillProps } from "@/components/ui/pill";
import { moveDealStageAction } from "./actions";

// Deal-stage column metadata. Tone maps to the Distillate <Pill>
// semantic palette — no raw hex, no Tailwind-default slate/blue.
//
//  - lead         → neutral (stone)  — just sourced, no signal yet
//  - qualified    → info (stone)     — qualified but inactive
//  - proposal     → warning (ochre)  — attention, awaiting response
//  - negotiation  → accent (olive)   — the brand moment, active
//  - won          → success (moss)   — closed-won
//  - lost         → danger (wine)    — closed-lost
const STAGES: ReadonlyArray<{
  key: DealStage;
  labelKey: string;
  tone: PillProps["tone"];
}> = [
  { key: "lead", labelKey: "crm.stageLead", tone: "neutral" },
  { key: "qualified", labelKey: "crm.stageQualified", tone: "info" },
  { key: "proposal", labelKey: "crm.stageProposal", tone: "warning" },
  { key: "negotiation", labelKey: "crm.stageNegotiation", tone: "accent" },
  { key: "won", labelKey: "crm.stageWon", tone: "success" },
  { key: "lost", labelKey: "crm.stageLost", tone: "danger" },
];

export function DealsBoard({
  deals,
  companiesById,
  contactsById,
}: {
  deals: DealRow[];
  companiesById: Record<string, CompanyRow>;
  contactsById: Record<string, ContactRow>;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  const [optimisticDeals, applyOptimistic] = useOptimistic(
    deals,
    (state: DealRow[], move: { dealId: string; stage: DealStage }) =>
      state.map((d) =>
        d.id === move.dealId ? { ...d, stage: move.stage } : d,
      ),
  );

  const byStage = useMemo(() => {
    const m = new Map<DealStage, DealRow[]>();
    for (const s of STAGES) m.set(s.key, []);
    for (const d of optimisticDeals) {
      const arr = m.get(d.stage as DealStage);
      if (arr) arr.push(d);
    }
    return m;
  }, [optimisticDeals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const dealId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const targetStage = parseStage(overId);
    if (!targetStage) return;
    const current = optimisticDeals.find((d) => d.id === dealId);
    if (!current || current.stage === targetStage) return;
    startTransition(async () => {
      applyOptimistic({ dealId, stage: targetStage });
      const res = await moveDealStageAction(dealId, targetStage);
      if (res.ok) router.refresh();
    });
  }

  const totals = useMemo(() => {
    const t = new Map<DealStage, { count: number; value: number }>();
    for (const s of STAGES) t.set(s.key, { count: 0, value: 0 });
    for (const d of optimisticDeals) {
      const acc = t.get(d.stage as DealStage);
      if (acc) {
        acc.count += 1;
        acc.value += Number(d.value_amount ?? 0);
      }
    }
    return t;
  }, [optimisticDeals]);

  const activeDeal = activeId
    ? optimisticDeals.find((d) => d.id === activeId)
    : null;

  if (!mounted) {
    return <BoardSkeleton />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-3">
        {STAGES.map((stage) => {
          const items = byStage.get(stage.key) ?? [];
          const total = totals.get(stage.key) ?? { count: 0, value: 0 };
          return (
            <Column
              key={stage.key}
              stage={stage}
              deals={items}
              count={total.count}
              valueTotal={total.value}
              companiesById={companiesById}
              contactsById={contactsById}
            />
          );
        })}
      </div>
      <DragOverlay>
        {activeDeal ? (
          <DealCard
            deal={activeDeal}
            company={
              activeDeal.company_id
                ? companiesById[activeDeal.company_id] ?? null
                : null
            }
            contact={
              activeDeal.primary_contact_id
                ? contactsById[activeDeal.primary_contact_id] ?? null
                : null
            }
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  deals,
  count,
  valueTotal,
  companiesById,
  contactsById,
}: {
  stage: (typeof STAGES)[number];
  deals: DealRow[];
  count: number;
  valueTotal: number;
  companiesById: Record<string, CompanyRow>;
  contactsById: Record<string, ContactRow>;
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.key}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-[10px] border border-border-soft bg-bg-2/60",
        isOver && "border-accent bg-accent-tint/40",
      )}
    >
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <div className="flex items-center gap-2">
          <Pill tone={stage.tone} dot>
            {t(stage.labelKey)}
          </Pill>
          <span className="rounded bg-bg-3 px-1.5 font-mono text-[10px] tabular-nums text-fg-muted">
            {count}
          </span>
        </div>
        {valueTotal > 0 ? (
          <span className="font-mono text-[10px] tabular-nums text-fg-muted">
            {formatCurrency(valueTotal)}
          </span>
        ) : null}
      </div>
      <SortableContext items={deals.map((d) => d.id)}>
        <div className="flex flex-col gap-2 p-2">
          {deals.length === 0 ? (
            <div className="rounded border border-dashed border-border-soft py-6 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
              {t("crm.noDealsInStage")}
            </div>
          ) : (
            deals.map((d) => (
              <SortableCard
                key={d.id}
                deal={d}
                company={
                  d.company_id ? companiesById[d.company_id] ?? null : null
                }
                contact={
                  d.primary_contact_id
                    ? contactsById[d.primary_contact_id] ?? null
                    : null
                }
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({
  deal,
  company,
  contact,
}: {
  deal: DealRow;
  company: CompanyRow | null;
  contact: ContactRow | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DealCard deal={deal} company={company} contact={contact} />
    </div>
  );
}

function DealCard({
  deal,
  company,
  contact,
  dragging,
}: {
  deal: DealRow;
  company: CompanyRow | null;
  contact: ContactRow | null;
  dragging?: boolean;
}) {
  return (
    <a
      href={`?deal=${deal.id}`}
      onClick={(e) => {
        // Let dnd-kit handle drag clicks; only navigate on plain click.
        if (e.defaultPrevented) return;
      }}
      className={cn(
        "block cursor-grab rounded-md border border-border bg-background p-2.5 text-xs shadow-sm hover:border-accent/50",
        dragging && "rotate-1 cursor-grabbing shadow-modal",
      )}
    >
      <div className="mb-1 line-clamp-2 font-medium text-foreground">
        {deal.title}
      </div>
      {company ? (
        <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
          <CompanyLogo
            src={company.logo_url}
            domain={company.domain}
            name={company.name}
            size="sm"
          />
          <span className="truncate">{company.name}</span>
        </div>
      ) : null}
      {contact ? (
        <div className="mb-1 truncate text-[10px] text-muted-foreground">
          {contact.full_name}
        </div>
      ) : null}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="tabular-nums">
          {deal.value_amount
            ? formatCurrency(Number(deal.value_amount), deal.value_currency)
            : "—"}
        </span>
        {deal.expected_close_date ? (
          <span className="font-mono">{deal.expected_close_date}</span>
        ) : null}
      </div>
    </a>
  );
}

function BoardSkeleton() {
  const t = useT();
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {STAGES.map((s) => (
        <div
          key={s.key}
          className="flex w-72 shrink-0 flex-col rounded-[10px] border border-border-soft bg-bg-2/60"
        >
          <div className="flex items-center gap-2 border-b border-border-soft px-3 py-2">
            <Pill tone={s.tone} dot>
              {t(s.labelKey)}
            </Pill>
          </div>
          <div className="h-24" />
        </div>
      ))}
    </div>
  );
}

function parseStage(id: string): DealStage | null {
  if (!id.startsWith("stage:")) return null;
  const k = id.slice("stage:".length);
  return STAGES.some((s) => s.key === k) ? (k as DealStage) : null;
}

function formatCurrency(amount: number, currency: string | null = "MXN"): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "MXN",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("es-MX")} ${currency || ""}`;
  }
}
