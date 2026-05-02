import { NextResponse } from "next/server";
import { getSupabaseAdmin, type CandidateNoteRow } from "@/lib/supabase";
import { resolvePortalAndCandidate } from "@/lib/portal-access";

export const dynamic = "force-dynamic";

const MAX_NAME_LEN = 80;
const MAX_NOTE_LEN = 4000;

type Params = { params: Promise<{ slug: string; candidateSlug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug, candidateSlug } = await params;
  const access = await resolvePortalAndCandidate(slug, candidateSlug);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 410 ? "Portal disabled" : "Not found" },
      { status: access.status },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("candidate_notes")
    .select("*")
    .eq("candidate_cache_id", access.candidate.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notes: (data ?? []) as CandidateNoteRow[] });
}

export async function POST(req: Request, { params }: Params) {
  const { slug, candidateSlug } = await params;
  const access = await resolvePortalAndCandidate(slug, candidateSlug);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 410 ? "Portal disabled" : "Not found" },
      { status: access.status },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as { author_name?: unknown; note_text?: unknown };
  const authorName =
    typeof raw.author_name === "string" ? raw.author_name.trim() : "";
  const noteText =
    typeof raw.note_text === "string" ? raw.note_text.trim() : "";

  if (!authorName || !noteText) {
    return NextResponse.json(
      { error: "author_name and note_text are required" },
      { status: 400 },
    );
  }
  if (authorName.length > MAX_NAME_LEN) {
    return NextResponse.json(
      { error: `author_name exceeds ${MAX_NAME_LEN} characters` },
      { status: 400 },
    );
  }
  if (noteText.length > MAX_NOTE_LEN) {
    return NextResponse.json(
      { error: `note_text exceeds ${MAX_NOTE_LEN} characters` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("candidate_notes")
    .insert({
      candidate_cache_id: access.candidate.id,
      portal_link_id: access.portal.id,
      author_name: authorName,
      note_text: noteText,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ note: data as CandidateNoteRow }, { status: 201 });
}
