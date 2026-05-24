import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { hiring } from "@/lib/hiring";

/**
 * GET /api/jobs/[jobId]/export-csv
 *
 * Streams a CSV of every application on the vacante — one row per
 * applicant — for the recruiter to share with the client or import
 * into a spreadsheet.
 *
 * RLS already gates which jobs the session can see, so we just
 * authenticate and then run the query; the policies do the
 * workspace-scoping for us.
 *
 * Columns (kept stable so spreadsheets that consume this don't break):
 *   nombre, email, telefono, linkedin, etapa, fuente, ultima_actividad,
 *   tags
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const { jobId } = await params;
  const db = await hiring();

  const [{ data: job }, { data: apps }, { data: stages }] = await Promise.all([
    db.from("jobs").select("title").eq("id", jobId).maybeSingle(),
    db
      .from("applications")
      .select(
        "id, candidate_id, stage_id, source, applied_at, status_changed_at",
      )
      .eq("job_id", jobId),
    db
      .from("pipeline_stages")
      .select("id, name")
      .eq("job_id", jobId),
  ]);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );
  }
  const appRows = apps ?? [];
  const stageNameById = new Map<string, string>();
  for (const s of stages ?? []) stageNameById.set(s.id as string, s.name as string);

  // Hydrate candidate detail in one query.
  const candidatesById = new Map<
    string,
    {
      full_name: string;
      email: string | null;
      phone: string | null;
      linkedin_url: string | null;
    }
  >();
  if (appRows.length > 0) {
    const { data: candidates } = await db
      .from("candidates")
      .select("id, full_name, email, phone, linkedin_url")
      .in("id", appRows.map((a) => a.candidate_id as string));
    for (const c of candidates ?? []) {
      candidatesById.set(c.id as string, {
        full_name: c.full_name as string,
        email: (c.email as string | null) ?? null,
        phone: (c.phone as string | null) ?? null,
        linkedin_url: (c.linkedin_url as string | null) ?? null,
      });
    }
  }

  // Tags per application.
  const tagsByApplicationId = new Map<string, string[]>();
  if (appRows.length > 0) {
    const { data: links } = await db
      .from("entity_tags")
      .select("entity_id, tag_id")
      .eq("entity_type", "application")
      .in("entity_id", appRows.map((a) => a.id as string));
    const tagIds = Array.from(
      new Set((links ?? []).map((l) => l.tag_id as string)),
    );
    const tagNameById = new Map<string, string>();
    if (tagIds.length > 0) {
      const { data: tagRows } = await db
        .from("tags")
        .select("id, name")
        .in("id", tagIds);
      for (const t of tagRows ?? []) {
        tagNameById.set(t.id as string, t.name as string);
      }
    }
    for (const link of links ?? []) {
      const name = tagNameById.get(link.tag_id as string);
      if (!name) continue;
      const aid = link.entity_id as string;
      const arr = tagsByApplicationId.get(aid) ?? [];
      arr.push(name);
      tagsByApplicationId.set(aid, arr);
    }
  }

  function esc(v: unknown): string {
    if (v == null) return "";
    const s = String(v);
    // CSV escape: wrap in quotes when the value contains a quote,
    // comma, or newline; double-up internal quotes.
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  const header = [
    "nombre",
    "email",
    "telefono",
    "linkedin",
    "etapa",
    "fuente",
    "ultima_actividad",
    "tags",
  ];
  const lines = [header.join(",")];
  for (const a of appRows) {
    const c = candidatesById.get(a.candidate_id as string);
    const stage = a.stage_id ? stageNameById.get(a.stage_id as string) : null;
    const last =
      (a.status_changed_at as string | null) ?? (a.applied_at as string | null);
    const tags = tagsByApplicationId.get(a.id as string) ?? [];
    lines.push(
      [
        esc(c?.full_name),
        esc(c?.email),
        esc(c?.phone),
        esc(c?.linkedin_url),
        esc(stage),
        esc(a.source),
        esc(last),
        esc(tags.join("; ")),
      ].join(","),
    );
  }

  const csv = lines.join("\n") + "\n";
  // Title slugged for the filename — keep it readable.
  const slug = (job.title as string)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug || "vacante"}-candidatos.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
