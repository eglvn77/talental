"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolvePortalToken } from "@/lib/portal/resolve-token";
import { isValidEmail, readPortalSession, startPortalSession } from "@/lib/portal/session";
import { tokenCanSeeJob } from "@/lib/portal/access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyPortalComment } from "@/lib/portal/notify";
import { siteUrl } from "@/lib/site-url";

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Public action — sets the portal session cookie for a (slug, email)
 * pair. Anyone can call it; the slug IS the auth boundary. Trust-only
 * email — no verification, just attribution.
 */
export async function portalLoginAction(input: {
  slug: string;
  email: string;
}): Promise<Result> {
  const token = await resolvePortalToken(input.slug);
  if (!token) return { ok: false, error: "tokenInvalid" };
  if (!isValidEmail(input.email)) return { ok: false, error: "emailInvalid" };

  // Whitelist gate: if the token has any allowed emails, the entered
  // email must be one of them. Empty whitelist → open (any email).
  const sb = getSupabaseAdmin();
  const { data: allowed } = await sb
    .schema("hiring")
    .from("portal_allowed_emails")
    .select("email")
    .eq("token_id", token.id);
  const list = (allowed ?? []) as Array<{ email: string }>;
  if (list.length > 0) {
    const clean = input.email.trim().toLowerCase();
    const ok = list.some((row) => row.email.toLowerCase() === clean);
    if (!ok) return { ok: false, error: "emailNotAllowed" };
  }

  await startPortalSession(token, input.email);
  redirect(`/portal/${input.slug}`);
}

/**
 * Post a comment (and/or thumbs reaction) on an application. Validates
 * the session belongs to this slug and that the token grants access to
 * the underlying job. Inserts an immutable row; the cookie's session_id
 * provides the audit link to the email.
 */
export async function portalPostCommentAction(input: {
  slug: string;
  applicationId: string;
  body?: string;
  sentiment?: "up" | "down" | null;
}): Promise<Result> {
  const token = await resolvePortalToken(input.slug);
  if (!token) return { ok: false, error: "tokenInvalid" };
  const session = await readPortalSession(token);
  if (!session) return { ok: false, error: "noSession" };

  const sb = getSupabaseAdmin();
  const db = sb.schema("hiring");
  const { data: app } = await db
    .from("applications")
    .select("id, job_id, candidate_id")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!app) return { ok: false, error: "notFound" };
  const jobId = app.job_id as string;
  if (!(await tokenCanSeeJob(token, jobId))) {
    return { ok: false, error: "forbidden" };
  }

  // Per-job toggle: when allow_feedback=false the portal becomes 100%
  // read-only.
  const { data: settings } = await db
    .from("job_client_portal_settings")
    .select("allow_feedback")
    .eq("job_id", jobId)
    .maybeSingle();
  if (settings && settings.allow_feedback === false) {
    return { ok: false, error: "feedbackDisabled" };
  }

  const body = input.body?.trim() || null;
  const sentiment = input.sentiment ?? null;
  if (!body && !sentiment) return { ok: false, error: "empty" };

  const { error } = await db.from("portal_comments").insert({
    workspace_id: token.workspace_id,
    application_id: input.applicationId,
    portal_session_id: session.sessionId,
    email_snapshot: session.email,
    body,
    sentiment,
  });
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  // Fire-and-forget: pull what notify needs and call it. Failures are
  // swallowed inside notifyPortalComment.
  void (async () => {
    const [{ data: job }, { data: cand }, { data: ws }] = await Promise.all([
      db.from("jobs").select("title").eq("id", jobId).maybeSingle(),
      db
        .from("candidates")
        .select("full_name")
        .eq("id", app.candidate_id as string)
        .maybeSingle(),
      db
        .from("workspaces")
        .select("name")
        .eq("id", token.workspace_id)
        .maybeSingle(),
    ]);
    const base = await siteUrl();
    await notifyPortalComment({
      workspaceName: (ws?.name as string) ?? "Talental",
      jobTitle: (job?.title as string) ?? "—",
      candidateName: (cand?.full_name as string) ?? "—",
      email: session.email,
      body,
      sentiment,
      candidateUrl: `${base}/portal/${input.slug}/c/${app.candidate_id}?app=${input.applicationId}`,
    });
  })();

  revalidatePath(`/portal/${input.slug}/c/${app.candidate_id}`);
  return { ok: true };
}

/**
 * Public action — anonymous comment by name only (no email gate).
 * Used by the application-share page where the visitor just types
 * their name and a comment. The token's application_id is the
 * source of truth for which application this lands on.
 */
export async function portalPostAnonCommentAction(input: {
  slug: string;
  authorName: string;
  body?: string;
  sentiment?: "up" | "down" | null;
}): Promise<Result> {
  const token = await resolvePortalToken(input.slug);
  if (!token) return { ok: false, error: "tokenInvalid" };
  if (token.scope !== "application" || !token.application_id) {
    return { ok: false, error: "tokenInvalid" };
  }
  const name = (input.authorName ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, error: "nameRequired" };

  const body = input.body?.trim() || null;
  const sentiment = input.sentiment ?? null;
  if (!body && !sentiment) return { ok: false, error: "empty" };

  const sb = getSupabaseAdmin();
  const db = sb.schema("hiring");
  const { error } = await db.from("portal_comments").insert({
    workspace_id: token.workspace_id,
    application_id: token.application_id,
    author_name: name,
    body,
    sentiment,
    // portal_session_id + email_snapshot intentionally null; the
    // updated CHECK constraint allows author_name as the identity.
    portal_session_id: null,
    email_snapshot: null,
  });
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  // Notify Slack just like the email-gated flow — surface every
  // public comment to the recruiter so they don't have to poll
  // the share page.
  void (async () => {
    const [{ data: app }, { data: ws }] = await Promise.all([
      db
        .from("applications")
        .select("candidate_id, job_id")
        .eq("id", token.application_id!)
        .maybeSingle(),
      db
        .from("workspaces")
        .select("name")
        .eq("id", token.workspace_id)
        .maybeSingle(),
    ]);
    if (!app) return;
    const [{ data: job }, { data: cand }] = await Promise.all([
      db.from("jobs").select("title").eq("id", app.job_id as string).maybeSingle(),
      db
        .from("candidates")
        .select("full_name")
        .eq("id", app.candidate_id as string)
        .maybeSingle(),
    ]);
    const base = await siteUrl();
    await notifyPortalComment({
      workspaceName: (ws?.name as string) ?? "Talental",
      jobTitle: (job?.title as string) ?? "—",
      candidateName: (cand?.full_name as string) ?? "—",
      email: name + " (anon)",
      body,
      sentiment,
      candidateUrl: `${base}/portal/${input.slug}`,
    });
  })();

  revalidatePath(`/portal/${input.slug}`);
  return { ok: true };
}
