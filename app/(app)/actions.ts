"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAuthenticated } from "@/lib/auth/session";
import { requireAdmin, requireCurrentTeamMember } from "@/lib/auth/team";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hiring,
  DEFAULT_PIPELINE_STAGES,
  getRequestWorkspaceId,
  type CandidateSource,
  type CompanyStatus,
  type JobRow,
  type JobStatusRow,
  type JobHiringProcessStep,
  type ApplicationQuestion,
  type AIInterviewCategory,
} from "@/lib/hiring";
import { canOpenJob, resolveDefaultJobStatusId } from "@/lib/job-status";
import { resolveDefaultCompanyStatusKey } from "@/lib/company-status";
import { canonicalizeLinkedinUrl, linkedinPublicId } from "@/lib/linkedin";
import { getT } from "@/lib/i18n/server";
import { parseResumeText, type ParsedProfile } from "@/lib/resume-parse";
import { sanitizeRichText } from "./_components/sanitize-html";
import { sanitizeCurrency, DEFAULT_CURRENCY } from "@/lib/currencies";
import {
  BULK_MAX_FILES,
  BULK_MAX_FILE_BYTES,
  mergeStringArrays,
  type BulkCommitDecision,
  type BulkCommitResult,
  type BulkConflictGroup,
  type BulkFailedItem,
  type BulkParseItem,
  type BulkParseResult,
  type ResolvedScalarFields,
} from "@/lib/cv-batch";

const RESUME_BUCKET = "hiring-resumes";
const COMPANY_LOGO_BUCKET = "company-logos";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAuthenticated())) return { ok: false, error: "Unauthorized" };
  return { ok: true };
}

/**
 * Seed a new job's pipeline_stages from a process template. The
 * template's stages are copied 1:1 (name, category, color, position,
 * client_portal_visible). Terminal-ness is implicit from category —
 * hired/rejected/withdrawn close the candidate automatically. If no
 * `templateId` is given — or the lookup fails — we fall back to the
 * hard-coded `DEFAULT_PIPELINE_STAGES` so a vacante never opens
 * stage-less.
 *
 * Returns the number of stages actually seeded so the caller can
 * detect "I asked for a template but got fallback" if needed.
 */
async function seedStagesForJob(
  jobId: string,
  workspaceId: string,
  templateId: string | null,
): Promise<number> {
  const db = await hiring();
  const t = await getT();

  if (templateId) {
    // Pull the template's stages (RLS scopes to the workspace so a
    // cross-tenant id can't sneak through). We capture each stage's
    // id too so we can stamp it on the per-job copy as
    // template_stage_id — that link is what lets template edits
    // propagate back into existing vacantes.
    const { data: tplStages } = await db
      .from("process_template_stages")
      .select("id, name, category, color, position, client_portal_visible")
      .eq("template_id", templateId)
      .order("position", { ascending: true });
    if (tplStages && tplStages.length > 0) {
      await db.from("pipeline_stages").insert(
        tplStages.map((s) => ({
          workspace_id: workspaceId,
          job_id: jobId,
          template_stage_id: s.id as string,
          name: s.name as string,
          category: s.category,
          color: s.color as string,
          position: s.position as number,
          client_portal_visible:
            (s.client_portal_visible as boolean | null) ?? false,
        })),
      );
      // Record the template link on the job so future template
      // edits know which vacantes to propagate to.
      await db
        .from("jobs")
        .update({ process_template_id: templateId })
        .eq("id", jobId);
      return tplStages.length;
    }
  }

  // Fallback: hard-coded defaults. Should only fire when a workspace
  // has no templates yet (pre-migration installs, etc.). No template
  // link in this branch — these jobs are intentionally detached and
  // won't pick up future template edits.
  await db.from("pipeline_stages").insert(
    DEFAULT_PIPELINE_STAGES.map((s, i) => ({
      workspace_id: workspaceId,
      job_id: jobId,
      name: t(`pipeline.defaultStage.${s.category}`),
      category: s.category,
      color: s.color,
      position: (i + 1) * 10,
      client_portal_visible: s.client_portal_visible ?? false,
    })),
  );
  return DEFAULT_PIPELINE_STAGES.length;
}

/**
 * Resolve the pipeline stage a new application should land in. Uses the
 * caller-picked `stageId` when it's a real stage of this job; otherwise
 * falls back to the job's first stage (lowest position) — typically
 * "Sourced". Shared by every "add candidate" path so the stage the user
 * chose in the add-candidates flow is honored consistently.
 */
async function resolveTargetStageId(
  db: Awaited<ReturnType<typeof hiring>>,
  workspaceId: string,
  jobId: string,
  stageId?: string | null,
): Promise<string | null> {
  if (stageId) {
    const { data } = await db
      .from("pipeline_stages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("job_id", jobId)
      .eq("id", stageId)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data: first } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("job_id", jobId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (first?.id as string | undefined) ?? null;
}

type WorkModality = "remote" | "hybrid" | "onsite";

function sanitizeWorkModality(v: unknown): WorkModality | null {
  return v === "remote" || v === "hybrid" || v === "onsite" ? v : null;
}

function sanitizeSalaryType(
  v: unknown,
): "gross" | "net" | "unspecified" | null {
  return v === "gross" || v === "net" || v === "unspecified" ? v : null;
}

function sanitizeSalaryFrequency(
  v: unknown,
): "monthly" | "annual" | "weekly" | "hourly" | null {
  return v === "monthly" || v === "annual" || v === "weekly" || v === "hourly"
    ? v
    : null;
}

/**
 * Commercial-terms fields captured at job opening (and editable in
 * Ajustes). Replaces the external Sheets tracker — each maps 1:1 to
 * a column in the jobs_add_fee_terms migration.
 *
 * All optional: a vacante can land in Borrador without commercial
 * terms set yet, then have them filled when the user fully scopes
 * the engagement.
 */
export type FeeTermsInput = {
  feeModel?: "retained" | "contingent" | null;
  billingFormat?: "invoice" | "factura" | null;
  feeMonths?: number | null;
  feePct?: number | null;
  retainerPct?: number | null;
  recruiterSplitPct?: number | null;
  /**
   * The sourcer / external recruiter for this vacante. Points to a
   * row in hiring.contacts. Replaces the older
   * `recruiterTeamMemberId` (which targeted team_members and was
   * the wrong domain for boutique workflows where the sourcer is
   * usually an external freelancer).
   */
  sourcerContactId?: string | null;
  /**
   * @deprecated kept for backward compatibility with form payloads
   * still emitting the old field. Server-side it is ignored — the
   * column remains in the DB but unused. Drop in a follow-up.
   */
  recruiterTeamMemberId?: string | null;
  leadContactId?: string | null;
  leadCompanyId?: string | null;
  leadSplitPct?: number | null;
};

/**
 * Clamp + sanitize the fee-terms input → the exact `Partial<Row>` we
 * can hand to a Supabase insert/update. Drops anything outside the
 * sane ranges, normalises the enums, enforces the lead-recipient
 * mutual-exclusion (the DB CHECK enforces it too — this just gives
 * the user a friendlier failure mode).
 */
function sanitizeFeeTerms(t: FeeTermsInput): {
  fee_model: "retained" | "contingent" | null;
  billing_format: "invoice" | "factura" | null;
  fee_months: number | null;
  fee_pct: number | null;
  retainer_pct: number | null;
  recruiter_split_pct: number | null;
  sourcer_contact_id: string | null;
  recruiter_team_member_id: string | null;
  lead_contact_id: string | null;
  lead_company_id: string | null;
  lead_split_pct: number | null;
} {
  function clampPct(v: number | null | undefined): number | null {
    if (v == null || !Number.isFinite(v)) return null;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return Math.round(v * 100) / 100;
  }
  function clampMonths(v: number | null | undefined): number | null {
    if (v == null || !Number.isFinite(v)) return null;
    if (v < 0) return 0;
    if (v > 12) return 12;
    return Math.round(v * 100) / 100;
  }
  const fee_model =
    t.feeModel === "retained" || t.feeModel === "contingent"
      ? t.feeModel
      : null;
  const billing_format =
    t.billingFormat === "invoice" || t.billingFormat === "factura"
      ? t.billingFormat
      : null;
  // Retainer pct only stored when retained — clearing on switch is
  // a feature, not a bug.
  const retainer_pct =
    fee_model === "retained" ? clampPct(t.retainerPct) : null;
  // Lead recipient must be a single side. If both are sent (UI bug)
  // we keep the contact and clear the company.
  let lead_contact_id = t.leadContactId || null;
  let lead_company_id = t.leadCompanyId || null;
  if (lead_contact_id && lead_company_id) {
    lead_company_id = null;
  }
  const has_lead = Boolean(lead_contact_id || lead_company_id);
  const lead_split_pct = has_lead ? clampPct(t.leadSplitPct) : null;
  return {
    fee_model,
    billing_format,
    fee_months: clampMonths(t.feeMonths),
    fee_pct: clampPct(t.feePct),
    retainer_pct,
    recruiter_split_pct: clampPct(t.recruiterSplitPct),
    sourcer_contact_id: t.sourcerContactId || null,
    recruiter_team_member_id: t.recruiterTeamMemberId || null,
    lead_contact_id,
    lead_company_id,
    lead_split_pct,
  };
}

export async function createJobAction(input: {
  /**
   * Empresa is optional at create — recruiters can open the vacante
   * before knowing the client (or link it later from /jobs/[jobId]/
   * settings). When omitted, `jobs.company_id` stays NULL and no
   * status promotion happens.
   */
  companyId?: string | null;
  title: string;
  /**
   * Intake-first create: the recruiter opens the vacante from just the
   * intake materials and lets the kickoff infer the title/location. When
   * true, an empty `title` is allowed (stored blank) and the kickoff
   * backfills it. Otherwise an empty title is rejected as before.
   */
  inferDetails?: boolean;
  publicDescription?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string | null;
  salaryType?: string | null;
  salaryFrequency?: string | null;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string;
  workModality?: string | null;
  /**
   * Process template whose stages get copied into the new vacante's
   * pipeline. Optional — omitted falls back to the workspace's
   * default template (or the hard-coded DEFAULT_PIPELINE_STAGES if
   * the workspace somehow has none yet).
   */
  processTemplateId?: string | null;
  /**
   * Persist the public visibility flag for the company name at create
   * time. When false, the kickoff is also told to omit the company
   * from the JD/outreach so the generated body matches the toggle.
   * Defaults to the DB default (true) when omitted.
   */
  showCompanyInPosting?: boolean;
  /**
   * Fee terms are now captured in a separate per-job "Términos" tab
   * after creation (admin-only). Left here for backward compatibility
   * with any in-flight callsites; new flows should omit this and use
   * `updateJobAction({ feeTerms })` after the job exists.
   */
  feeTerms?: FeeTermsInput;
}): Promise<ActionResult<{ jobId: string }>> {
  // Admin-only: recruiters can't create vacantes (they'd grant
  // themselves access by being the assignee).
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const title = input.title.trim();
  if (!title && !input.inferDetails) {
    return { ok: false, error: "Title is required" };
  }

  // If a location was typed, it must come from the Google Maps autocomplete
  // (i.e. carry a place_id). Reject free-text locations.
  const locationText = input.location?.trim();
  if (locationText && !input.locationPlaceId) {
    const t = await getT();
    return {
      ok: false,
      error: t("errors.locationFromGoogleMaps"),
    };
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Empresa is optional. When provided, validate it belongs to this
  // workspace and promote prospect/none → client so the CRM stays in
  // sync. When omitted, the new vacante simply has `company_id = NULL`
  // and can be linked later from /jobs/[jobId]/settings.
  let companyIdToPersist: string | null = null;
  if (input.companyId) {
    const { data: company, error: companyErr } = await db
      .from("companies")
      .select("id, name, status")
      .eq("id", input.companyId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (companyErr || !company) {
      return { ok: false, error: "Company not found" };
    }
    if (company.status === "none" || company.status === "prospect") {
      await db
        .from("companies")
        .update({ status: "client" })
        .eq("id", company.id as string);
    }
    companyIdToPersist = company.id as string;
  }

  const fee = sanitizeFeeTerms(input.feeTerms ?? {});

  // Resolve the workspace's default status (system 'borrador' row
  // unless the admin renamed/deleted it, in which case we fall back
  // to the first row by position).
  const defaultStatusId = await resolveDefaultJobStatusId();
  if (!defaultStatusId) {
    const t = await getT();
    return {
      ok: false,
      error: t("errors.noJobStatusesConfigured"),
    };
  }

  // Resolve the process template (gives the job its pipeline stages).
  // Explicit param wins; otherwise the workspace's default template.
  // The role itself is no longer a job column — it's decided by the
  // kickoff prompt the recruiter picks.
  let resolvedTemplateId: string | null = input.processTemplateId ?? null;
  if (!resolvedTemplateId) {
    const { data: def } = await db
      .from("process_templates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_default", true)
      .maybeSingle();
    resolvedTemplateId = (def?.id as string | undefined) ?? null;
  }

  const { data: job, error: jobErr } = await db
    .from("jobs")
    .insert({
      workspace_id: workspaceId,
      company_id: companyIdToPersist,
      title,
      public_description: input.publicDescription
        ? sanitizeRichText(input.publicDescription) || null
        : null,
      salary_min: input.salaryMin ?? null,
      salary_max: input.salaryMax ?? null,
      salary_currency: input.salaryCurrency
        ? sanitizeCurrency(input.salaryCurrency)
        : DEFAULT_CURRENCY,
      salary_type: sanitizeSalaryType(input.salaryType) ?? "gross",
      salary_frequency:
        sanitizeSalaryFrequency(input.salaryFrequency) ?? "monthly",
      location: input.location?.trim() || null,
      location_lat: input.locationLat ?? null,
      location_lng: input.locationLng ?? null,
      location_place_id: input.locationPlaceId ?? null,
      work_modality: sanitizeWorkModality(input.workModality),
      process_template_id: resolvedTemplateId,
      status_id: defaultStatusId,
      // Only set when explicitly passed — DB default (true) covers
      // omitted callers and keeps prior behavior intact.
      ...(typeof input.showCompanyInPosting === "boolean"
        ? { show_company_in_posting: input.showCompanyInPosting }
        : {}),
      ...fee,
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    return {
      ok: false,
      error: jobErr?.message.slice(0, 300) || "Failed to create job",
    };
  }

  // Seed the pipeline from the template we already resolved above
  // (where we also pulled the inherited role_type). Falls back to
  // DEFAULT_PIPELINE_STAGES when no template is available.
  await seedStagesForJob(job.id as string, workspaceId, resolvedTemplateId);

  revalidatePath("/jobs");
  return { ok: true, data: { jobId: job.id as string } };
}

export async function updateJobAction(input: {
  jobId: string;
  title?: string;
  publicDescription?: string | null;
  fullDescription?: string | null;
  location?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationPlaceId?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryType?: string | null;
  salaryFrequency?: string | null;
  aiScoringEnabled?: boolean;
  aiScoringCriteria?: string | null;
  workModality?: string | null;
  // Paquete fields
  openDate?: string | null;
  /** Contacts (people on the client side) tied to this vacante. */
  contactIds?: string[];
  contractType?: string | null;
  workingHours?: string | null;
  compensationDetail?: string | null;
  internalNotes?: string | null;
  assessmentLink?: string | null;
  linkedinPost?: string | null;
  requirements?: { must: string[]; nice: string[] } | null;
  sourcing?: {
    criteria: string[];
    questions: string[];
    target_companies: string[];
  } | null;
  /**
   * Paquete dossier sections that the kickoff generates and the
   * recruiter can edit/reorder inline on the Paquete tab. Each maps to
   * its jsonb column; passing the key replaces the whole array (the
   * editor sends the full reordered set). `applicationQuestions` writes
   * the `screening_questions` column in the ApplicationQuestion shape —
   * the same shape the kickoff persists and the Paquete reads.
   */
  hiringProcess?: JobHiringProcessStep[] | null;
  applicationQuestions?: ApplicationQuestion[] | null;
  aiInterviewQuestions?: AIInterviewCategory[] | null;
  interviewScript?: string | null;
  companyId?: string | null;
  feeTerms?: FeeTermsInput;
  /**
   * Internal recruiter assignment. Only admins can change this;
   * the field is set to null to unassign. The current value is
   * preserved if the key is omitted.
   */
  recruiterTeamMemberId?: string | null;
  /**
   * Visibility flag: 'private' (default) only admins + the assigned
   * recruiter see the vacante; 'team' opens read access to every
   * member of the workspace. Edit + delete privileges stay gated
   * by the existing policies regardless.
   */
  visibility?: "private" | "team";
  /**
   * Public careers-site visibility:
   *   draft    — default, never accessible publicly
   *   listed   — appears on the careers landing + reachable by link
   *   unlisted — direct link only, hidden from the landing
   * Orthogonal to `status` (internal lifecycle).
   */
  publicationStatus?: "draft" | "listed" | "unlisted";
  /**
   * "Configuración del rol" block on the Ajustes tab. Only the two
   * column-backed knobs the AI flow needs every run: `role_type`
   * and `assessment_link`. The rest of the old setup (JD language,
   * anuncio flags, emojis, etc.) moved to custom fields and lives
   * in `custom_field_values` keyed by the seeded definitions —
   * touched through the standard CustomFieldsBlock UI, not through
   * this action.
   */
  roleConfig?: {
    assessmentLink?: string | null;
  };
  // ----- Publicación tab knobs -----
  postingLanguage?: "es" | "en";
  showSalaryInPosting?: boolean;
  showCompanyInPosting?: boolean;
  requireCv?: boolean;
  requireCoverLetter?: boolean;
  askForLocation?: boolean;
  askForSalaryExpectations?: boolean;
  screeningQuestions?: Array<{
    id: string;
    prompt: string;
    kind: "yes_no" | "short_text" | "multi_choice" | "number";
    required?: boolean;
    options?: string[];
  }>;
}): Promise<ActionResult> {
  // Admin-only: this action covers basic fields, sourcing, fee
  // terms, and assignment. Recruiters acting on their assigned
  // vacante move candidates between stages and edit notes through
  // dedicated actions — they don't reshape the vacante itself.
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { ok: false, error: "Title cannot be empty" };
    patch.title = t;
  }
  if (input.publicDescription !== undefined)
    patch.public_description = input.publicDescription
      ? sanitizeRichText(input.publicDescription) || null
      : null;
  if (input.fullDescription !== undefined)
    patch.full_description = input.fullDescription?.trim() || null;
  if (input.location !== undefined) {
    // Free-text location is allowed on update (inline Paquete edits, etc).
    // Forms that integrate Google Maps autocomplete (Ajustes) do client-side
    // validation themselves and pass the place_id + lat/lng triple.
    patch.location = input.location?.trim() || null;
    if (input.locationPlaceId !== undefined)
      patch.location_place_id = input.locationPlaceId || null;
    if (input.locationLat !== undefined) patch.location_lat = input.locationLat;
    if (input.locationLng !== undefined) patch.location_lng = input.locationLng;
  }
  if (input.salaryMin !== undefined) patch.salary_min = input.salaryMin;
  if (input.salaryMax !== undefined) patch.salary_max = input.salaryMax;
  if (input.salaryCurrency !== undefined)
    patch.salary_currency = input.salaryCurrency
      ? sanitizeCurrency(input.salaryCurrency)
      : null;
  if (input.salaryType !== undefined) {
    const sanitized = sanitizeSalaryType(input.salaryType);
    if (sanitized) patch.salary_type = sanitized;
  }
  if (input.salaryFrequency !== undefined) {
    const sanitized = sanitizeSalaryFrequency(input.salaryFrequency);
    if (sanitized) patch.salary_frequency = sanitized;
  }
  if (input.aiScoringEnabled !== undefined)
    patch.ai_scoring_enabled = input.aiScoringEnabled;
  if (input.aiScoringCriteria !== undefined)
    patch.ai_scoring_criteria = input.aiScoringCriteria?.trim() || null;
  if (input.workModality !== undefined)
    patch.work_modality = sanitizeWorkModality(input.workModality);
  if (input.openDate !== undefined) patch.open_date = input.openDate || null;
  if (input.contactIds !== undefined) {
    // Sanitize: keep only well-formed uuids, dedupe, cap length so a
    // pathological client can't push a giant array.
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const cleaned = Array.from(
      new Set(input.contactIds.filter((id) => uuidRe.test(id))),
    ).slice(0, 50);
    patch.contact_ids = cleaned;
  }
  if (input.contractType !== undefined)
    patch.contract_type = input.contractType?.trim() || null;
  if (input.workingHours !== undefined)
    patch.working_hours = input.workingHours?.trim() || null;
  if (input.compensationDetail !== undefined)
    patch.compensation_detail = input.compensationDetail?.trim() || null;
  if (input.internalNotes !== undefined)
    patch.internal_notes = input.internalNotes?.trim() || null;
  if (input.assessmentLink !== undefined)
    patch.assessment_link = input.assessmentLink?.trim() || null;
  if (input.linkedinPost !== undefined)
    patch.linkedin_post = input.linkedinPost?.trim() || null;
  if (input.requirements !== undefined) {
    if (input.requirements === null) {
      patch.requirements = null;
    } else {
      patch.requirements = {
        must: input.requirements.must
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        nice: input.requirements.nice
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      };
    }
  }
  if (input.companyId !== undefined) {
    patch.company_id = input.companyId || null;
  }
  if (input.recruiterTeamMemberId !== undefined) {
    patch.recruiter_team_member_id = input.recruiterTeamMemberId || null;
  }
  if (input.visibility !== undefined) {
    patch.visibility = input.visibility === "team" ? "team" : "private";
  }
  if (input.publicationStatus !== undefined) {
    const allowed = ["draft", "listed", "unlisted"] as const;
    patch.publication_status = (allowed as readonly string[]).includes(
      input.publicationStatus,
    )
      ? input.publicationStatus
      : "draft";
  }
  if (input.roleConfig !== undefined) {
    const rc = input.roleConfig;
    if (rc.assessmentLink !== undefined)
      patch.assessment_link = rc.assessmentLink?.trim() || null;
  }
  if (input.feeTerms !== undefined) {
    // Send the full sanitized block so the row reflects exactly what
    // the form captured — partial updates here would orphan stale
    // splits (e.g. lead_company_id left set after the user toggled
    // the lead off).
    Object.assign(patch, sanitizeFeeTerms(input.feeTerms));
  }
  if (input.sourcing !== undefined) {
    if (input.sourcing === null) {
      patch.sourcing = null;
    } else {
      const clean = (xs: string[]) =>
        xs.map((s) => s.trim()).filter((s) => s.length > 0);
      patch.sourcing = {
        criteria: clean(input.sourcing.criteria),
        questions: clean(input.sourcing.questions),
        target_companies: clean(input.sourcing.target_companies),
      };
    }
  }

  // Paquete dossier sections — editable + reorderable on the Paquete
  // tab. Each replaces its whole jsonb column with the editor's full
  // (reordered) set; empty rows are dropped so a blank trailing row the
  // user added but never filled doesn't persist. `order`/positions are
  // re-derived from array index so reordering is authoritative.
  if (input.hiringProcess !== undefined) {
    patch.hiring_process =
      input.hiringProcess === null
        ? null
        : input.hiringProcess
            .filter((s) => (s.who ?? "").trim() || (s.focus ?? "").trim())
            .map((s, i) => ({
              order: i + 1,
              who: (s.who ?? "").trim(),
              focus: (s.focus ?? "").trim(),
              format: s.format?.trim() || null,
            }));
  }
  if (input.applicationQuestions !== undefined) {
    patch.screening_questions =
      input.applicationQuestions === null
        ? null
        : input.applicationQuestions
            .filter((q) => (q.question ?? "").trim())
            .map((q) => ({
              question: (q.question ?? "").trim(),
              requirement: (q.requirement ?? "").trim(),
              type: q.type === "eliminatory" ? "eliminatory" : "preferential",
              auto_reject_rule: q.auto_reject_rule?.trim() || null,
            }));
  }
  if (input.aiInterviewQuestions !== undefined) {
    patch.interview_questions =
      input.aiInterviewQuestions === null
        ? null
        : input.aiInterviewQuestions
            .filter((c) => (c.category ?? "").trim())
            .map((c) => ({
              category: (c.category ?? "").trim(),
              description: c.description?.trim() || undefined,
              criteria: (c.criteria ?? [])
                .filter((cr) => (cr.name ?? "").trim() || (cr.question ?? "").trim())
                .map((cr) => ({
                  name: (cr.name ?? "").trim(),
                  question: (cr.question ?? "").trim(),
                  strong: (cr.strong ?? "").trim(),
                  weak: (cr.weak ?? "").trim(),
                  rationale: cr.rationale?.trim() || undefined,
                })),
            }));
  }
  if (input.interviewScript !== undefined) {
    const md = input.interviewScript?.trim();
    patch.interview_script = md ? { markdown: md } : null;
  }

  // Publicación block. All optional, all idempotent — checked
  // individually so toggling one knob doesn't reset the others.
  if (input.postingLanguage !== undefined) {
    patch.posting_language =
      input.postingLanguage === "en" ? "en" : "es";
  }
  if (typeof input.showSalaryInPosting === "boolean")
    patch.show_salary_in_posting = input.showSalaryInPosting;
  if (typeof input.showCompanyInPosting === "boolean")
    patch.show_company_in_posting = input.showCompanyInPosting;
  if (typeof input.requireCv === "boolean") patch.require_cv = input.requireCv;
  if (typeof input.requireCoverLetter === "boolean")
    patch.require_cover_letter = input.requireCoverLetter;
  if (typeof input.askForLocation === "boolean")
    patch.ask_for_location = input.askForLocation;
  if (typeof input.askForSalaryExpectations === "boolean")
    patch.ask_for_salary_expectations = input.askForSalaryExpectations;
  if (input.screeningQuestions !== undefined) {
    patch.screening_questions = input.screeningQuestions.map((q) => ({
      id: q.id,
      prompt: q.prompt.trim(),
      kind: q.kind,
      required: Boolean(q.required),
      ...(q.options && q.options.length > 0 ? { options: q.options } : {}),
    }));
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to update" };
  }

  const { error } = await (await hiring())
    .from("jobs")
    .update(patch)
    .eq("id", input.jobId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/jobs");
  return { ok: true };
}

export async function deleteJobAction(jobId: string): Promise<ActionResult> {
  // Admin-only: recruiters can't delete vacantes.
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  // ON DELETE CASCADE on applications + pipeline_stages cleans those up.
  const { error } = await (await hiring()).from("jobs").delete().eq("id", jobId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/jobs");
  return { ok: true };
}

/**
 * Bulk-delete vacantes from the /jobs table. Admin-only. Same cascade
 * semantics as the per-row deleteJobAction. Returns the count actually
 * removed (RLS may silently filter rows the caller can't touch).
 */
export async function bulkDeleteJobsAction(
  jobIds: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (jobIds.length === 0) return { ok: true, data: { deleted: 0 } };
  const { error, count } = await (await hiring())
    .from("jobs")
    .delete({ count: "exact" })
    .in("id", jobIds);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/jobs");
  return { ok: true, data: { deleted: count ?? 0 } };
}

/**
 * Bulk-assign a recruiter (or clear the assignment) to many vacantes.
 * Admin-only. Pass `recruiterTeamMemberId: null` to unassign.
 */
export async function bulkAssignRecruiterAction(input: {
  jobIds: string[];
  recruiterTeamMemberId: string | null;
}): Promise<ActionResult<{ updated: number }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (input.jobIds.length === 0) return { ok: true, data: { updated: 0 } };
  const { error, count } = await (await hiring())
    .from("jobs")
    .update(
      { recruiter_team_member_id: input.recruiterTeamMemberId },
      { count: "exact" },
    )
    .in("id", input.jobIds);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/jobs");
  return { ok: true, data: { updated: count ?? 0 } };
}

/**
 * List active team members for assignment pickers. Returns full_name +
 * avatar so the bulk-assign popover can render a clean row. Includes
 * everyone the current workspace can see (RLS-scoped); the UI sorts
 * by name.
 */
export async function loadAssignableMembersAction(): Promise<
  ActionResult<Array<{ id: string; full_name: string; avatar_url: string | null }>>
> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { data, error } = await (await hiring())
    .from("team_members")
    .select("id, full_name, avatar_url")
    .order("full_name", { ascending: true });
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    data: (data ?? []).map((m) => ({
      id: m.id as string,
      full_name: (m.full_name as string) ?? "",
      avatar_url: (m.avatar_url as string | null) ?? null,
    })),
  };
}

// Sequence-step + Cmd+K global search live in dedicated _actions/ modules:
//   - updateSequenceStepAction → ./_actions/sequences
//   - globalSearchAction + GlobalSearchHit → ./_actions/search
// "use server" files cannot re-export from other modules (only async
// function declarations are allowed), so import them directly.

export async function updateJobStatusAction(
  jobId: string,
  newStatusId: string,
  // Optional closure context. When the target status is is_archived,
  // closureReasonId is REQUIRED (server-enforced — bails with
  // {ok:false, requiresClosureReason:true} if missing). When the
  // target isn't archived, both fields are ignored.
  options?: {
    closureReasonId?: string | null;
    closureNotes?: string | null;
  },
): Promise<ActionResult & { requiresClosureReason?: true }> {
  // Admin-only: status transitions (activar / pausar / archivar) are
  // a commercial decision, not a recruiter action.
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();

  // Look up the target status's flags. Drives all the side effects
  // below (gate for is_open, closed_at for is_archived). Bail if the
  // id is foreign / nonexistent so we can't poison the job with a
  // status from another workspace.
  const { data: targetStatus } = await db
    .from("job_statuses")
    .select("id, key, is_open, is_archived, requires_closure_reason")
    .eq("id", newStatusId)
    .maybeSingle();
  if (!targetStatus) {
    const t = await getT();
    return { ok: false, error: t("errors.jobStatusNotFound") };
  }

  // Activation gate: when the status flips to is_open, ensure kickoff
  // content OR the manual-minimum fields are populated. Otherwise the
  // public posting + sourcing flows have nothing to ground on.
  if (targetStatus.is_open) {
    const { data: job } = await db
      .from("jobs")
      .select("overview, public_description")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) {
      const t = await getT();
      return { ok: false, error: t("errors.jobNotFound") };
    }
    const check = canOpenJob(
      job as Pick<JobRow, "overview" | "public_description">,
    );
    if (!check.ok) return { ok: false, error: check.reason };
  }

  const patch: Record<string, unknown> = { status_id: newStatusId };
  if (targetStatus.is_open) {
    patch.published_at = new Date().toISOString();
    // Seed open_date the first time the vacante actually opens.
    const { data: cur } = await db
      .from("jobs")
      .select("open_date")
      .eq("id", jobId)
      .maybeSingle();
    const curOpenDate = (cur as { open_date: string | null } | null)?.open_date;
    if (!curOpenDate) {
      patch.open_date = new Date().toISOString().slice(0, 10);
    }
  }
  if (targetStatus.is_archived) {
    // Positive closes (Filled / Hired) skip the closure-reason prompt
    // entirely — they still set closed_at, just no reason captured.
    // Cancellation-style archived statuses keep requires_closure_reason
    // true so the recruiter must pick a reason before committing.
    patch.closed_at = new Date().toISOString();
    if (targetStatus.requires_closure_reason) {
      if (!options?.closureReasonId) {
        return {
          ok: false,
          error: "closure_reason_required",
          requiresClosureReason: true,
        };
      }
      patch.closure_reason_id = options.closureReasonId;
      patch.closure_notes = options.closureNotes?.trim() || null;
    } else if (options?.closureReasonId) {
      // The status doesn't require it, but if the caller supplies one
      // (e.g. an admin form pre-tagging a Filled as "Hired by us"),
      // we still record it.
      patch.closure_reason_id = options.closureReasonId;
      patch.closure_notes = options.closureNotes?.trim() || null;
    }
  }
  const { error } = await db.from("jobs").update(patch).eq("id", jobId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/**
 * Add a candidate. When `jobId` is provided, also creates an
 * application in that job's first stage (the per-vacante flow).
 * When omitted, the candidate lands in the talent pool with no
 * application attached — used by the /candidates "Agregar
 * candidatos > Manualmente" entry. Returns either the new
 * application id (job mode) or just the candidate id (talent-pool
 * mode).
 */
export async function addCandidateAction(input: {
  jobId?: string;
  fullName: string;
  email?: string;
  linkedinUrl?: string;
  source: CandidateSource;
  /** Target pipeline stage. Defaults to the job's first stage. */
  stageId?: string | null;
}): Promise<
  ActionResult<{ applicationId?: string; candidateId: string }>
> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Full name is required" };

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  let candidateId: string | undefined;
  const email = input.email?.trim().toLowerCase();
  // Canonicalize LinkedIn so dedup matches every other write path; the
  // public id is the strongest dedup key (its own unique index).
  const linkedin = canonicalizeLinkedinUrl(input.linkedinUrl);
  const linkedinPid = linkedinPublicId(linkedin);
  if (email) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("email", email)
      .maybeSingle();
    candidateId = (data?.id as string | undefined) ?? undefined;
  }
  if (!candidateId && linkedinPid) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_public_id", linkedinPid)
      .maybeSingle();
    candidateId = (data?.id as string | undefined) ?? undefined;
  }
  if (!candidateId) {
    // Cross-bucket dedup: if there's an ACTIVE contact with the same
    // email or linkedin_url in this workspace, surface a conflict so
    // the UI can offer "open existing contact" or "convert to
    // candidate" instead of silently creating a duplicate person.
    const conflict = await findActiveOpposite(
      db,
      workspaceId,
      "candidates",
      email ?? null,
      linkedin,
    );
    if (conflict) {
      return {
        ok: false,
        error: "conflict_with_contact",
      };
    }
    // Stamp `created_by_team_member_id` so recruiters can see the
    // candidates they personally added even before an application
    // attaches them to one of their vacantes (Q1 option C).
    const creator = await requireCurrentTeamMember();
    const createdByTeamMemberId = creator.ok ? creator.data.id : null;
    const { data: created, error: insErr } = await db
      .from("candidates")
      .insert({
        workspace_id: workspaceId,
        full_name: fullName,
        email: email || null,
        linkedin_url: linkedin,
        linkedin_public_id: linkedinPid,
        default_source: input.source,
        created_by_team_member_id: createdByTeamMemberId,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return {
        ok: false,
        error: insErr?.message.slice(0, 300) || "Failed to create candidate",
      };
    }
    candidateId = created.id as string;
  }

  // Talent-pool mode: no jobId → no application. Just return the
  // candidate id and revalidate the /candidates page.
  if (!input.jobId) {
    revalidatePath("/candidates");
    return { ok: true, data: { candidateId } };
  }

  // Target stage: the one the user picked, else the role's first stage
  // (lowest position) — typically "Sourced".
  const stageId = await resolveTargetStageId(db, workspaceId, input.jobId, input.stageId);

  const { data: app, error: appErr } = await db
    .from("applications")
    .insert({
      workspace_id: workspaceId,
      candidate_id: candidateId,
      job_id: input.jobId,
      source: input.source,
      stage_id: stageId,
    })
    .select("id")
    .single();
  if (appErr || !app) {
    return {
      ok: false,
      error:
        appErr?.message.slice(0, 300) || "Failed to create application",
    };
  }

  revalidatePath(`/jobs/${input.jobId}`);
  return {
    ok: true,
    data: { applicationId: app.id as string, candidateId },
  };
}

// ============================================================
// Candidate ↔ Contact link (Phase 2: conversion + conflict detection)
// ============================================================

/** Conflict shape surfaced from cross-table dedup checks. The UI shows
 *  "ya existe — abrir el otro o cancelar" instead of letting the
 *  create silently succeed and create a duplicate person. */
export type CrossRoleConflict = {
  otherEntity: "candidate" | "contact";
  otherId: string;
  otherName: string;
  matchedOn: "email" | "linkedin_url";
};

async function findActiveOpposite(
  db: Awaited<ReturnType<typeof hiring>>,
  workspaceId: string,
  bucket: "candidates" | "contacts",
  email: string | null,
  linkedinUrl: string | null,
): Promise<CrossRoleConflict | null> {
  const opposite = bucket === "candidates" ? "contacts" : "candidates";
  const oppositeLinkCol =
    bucket === "candidates" ? "linked_candidate_id" : "linked_contact_id";
  if (email) {
    const { data } = await db
      .from(opposite)
      .select("id, full_name")
      .eq("workspace_id", workspaceId)
      .ilike("email", email)
      .is(oppositeLinkCol, null)
      .maybeSingle();
    if (data) {
      return {
        otherEntity: opposite === "contacts" ? "contact" : "candidate",
        otherId: data.id as string,
        otherName: (data.full_name as string) ?? "",
        matchedOn: "email",
      };
    }
  }
  if (linkedinUrl) {
    const { data } = await db
      .from(opposite)
      .select("id, full_name")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_url", linkedinUrl)
      .is(oppositeLinkCol, null)
      .maybeSingle();
    if (data) {
      return {
        otherEntity: opposite === "contacts" ? "contact" : "candidate",
        otherId: data.id as string,
        otherName: (data.full_name as string) ?? "",
        matchedOn: "linkedin_url",
      };
    }
  }
  return null;
}

/**
 * Convert an active candidate into a contact. Both rows stay in the DB
 * (the candidate keeps its applications + CV + notes; the new contact
 * lives in the CRM with deals + notes) and are linked bidirectionally
 * so future cross-history surfaces can show both sides. Once converted,
 * the candidate disappears from /candidates and the new contact appears
 * in /contacts.
 */
export async function convertCandidateToContactAction(input: {
  candidateId: string;
  /** Required: contacts live under a company in the CRM. */
  companyId: string;
  /** Optional job title at the new company. */
  title?: string | null;
}): Promise<
  ActionResult<{ contactId: string }> & { conflict?: CrossRoleConflict }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  const { data: cand, error: candErr } = await db
    .from("candidates")
    .select("id, full_name, email, phone, linkedin_url, location, linked_contact_id")
    .eq("id", input.candidateId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (candErr || !cand) {
    const t = await getT();
    return { ok: false, error: t("errors.notFound") };
  }
  if (cand.linked_contact_id) {
    return {
      ok: false,
      error: "candidate_already_converted",
      conflict: {
        otherEntity: "contact",
        otherId: cand.linked_contact_id as string,
        otherName: (cand.full_name as string) ?? "",
        matchedOn: "email",
      },
    };
  }

  const conflict = await findActiveOpposite(
    db,
    workspaceId,
    "candidates",
    (cand.email as string | null)?.toLowerCase() ?? null,
    (cand.linkedin_url as string | null) ?? null,
  );
  if (conflict) return { ok: false, error: "conflict", conflict };

  const fullName = (cand.full_name as string) ?? "Unnamed";
  // Insert the contact with linked_candidate_id set — keeps the
  // partial unique indexes on active rows from clashing on email /
  // linkedin while still preserving the bidirectional link.
  const { data: contact, error: insErr } = await db
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      full_name: fullName,
      email: cand.email ?? null,
      phone: cand.phone ?? null,
      linkedin_url: cand.linkedin_url ?? null,
      location: cand.location ?? null,
      title: input.title?.trim() || null,
      company_id: input.companyId,
      linked_candidate_id: input.candidateId,
    })
    .select("id")
    .single();
  if (insErr || !contact) {
    return {
      ok: false,
      error: insErr?.message.slice(0, 300) || "Failed to create contact",
    };
  }

  // Back-link the candidate so list filters can hide it.
  const { error: updErr } = await db
    .from("candidates")
    .update({ linked_contact_id: contact.id as string })
    .eq("id", input.candidateId);
  if (updErr) {
    // Soft-fail — the contact exists and points to the candidate, so
    // the relationship is queryable from one side. The user can re-
    // try the conversion to set the back-link.
    return {
      ok: false,
      error: updErr.message.slice(0, 300),
    };
  }

  revalidatePath("/candidates");
  revalidatePath("/contacts");
  return { ok: true, data: { contactId: contact.id as string } };
}

/**
 * Convert an active contact into a candidate. Mirror of the above —
 * the contact stays (deals + notes) and a fresh candidate row appears
 * for the new role.
 */
export async function convertContactToCandidateAction(input: {
  contactId: string;
}): Promise<
  ActionResult<{ candidateId: string }> & { conflict?: CrossRoleConflict }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  const { data: con, error: conErr } = await db
    .from("contacts")
    .select(
      "id, full_name, email, phone, linkedin_url, location, linked_candidate_id",
    )
    .eq("id", input.contactId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (conErr || !con) {
    const t = await getT();
    return { ok: false, error: t("errors.notFound") };
  }
  if (con.linked_candidate_id) {
    return {
      ok: false,
      error: "contact_already_converted",
      conflict: {
        otherEntity: "candidate",
        otherId: con.linked_candidate_id as string,
        otherName: (con.full_name as string) ?? "",
        matchedOn: "email",
      },
    };
  }

  const conflict = await findActiveOpposite(
    db,
    workspaceId,
    "contacts",
    (con.email as string | null)?.toLowerCase() ?? null,
    (con.linkedin_url as string | null) ?? null,
  );
  if (conflict) return { ok: false, error: "conflict", conflict };

  const fullName = (con.full_name as string) ?? "Unnamed";
  const linkedinPid = linkedinPublicId(
    (con.linkedin_url as string | null) ?? null,
  );
  const { data: cand, error: insErr } = await db
    .from("candidates")
    .insert({
      workspace_id: workspaceId,
      full_name: fullName,
      email: con.email ?? null,
      phone: con.phone ?? null,
      linkedin_url: con.linkedin_url ?? null,
      linkedin_public_id: linkedinPid,
      location: con.location ?? null,
      linked_contact_id: input.contactId,
    })
    .select("id")
    .single();
  if (insErr || !cand) {
    return {
      ok: false,
      error: insErr?.message.slice(0, 300) || "Failed to create candidate",
    };
  }

  const { error: updErr } = await db
    .from("contacts")
    .update({ linked_candidate_id: cand.id as string })
    .eq("id", input.contactId);
  if (updErr) {
    return { ok: false, error: updErr.message.slice(0, 300) };
  }

  revalidatePath("/contacts");
  revalidatePath("/candidates");
  return { ok: true, data: { candidateId: cand.id as string } };
}

// ============================================================

/**
 * Targets for the "add candidates" flow: every vacante the user can see
 * (RLS-scoped) plus each one's pipeline stages, so the picker can offer
 * "attach to vacante X, stage Y". Loaded lazily when the flow opens.
 */
export async function loadAddCandidateTargetsAction(): Promise<
  ActionResult<{
    jobs: Array<{
      id: string;
      title: string;
      stages: Array<{ id: string; name: string }>;
    }>;
  }>
> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const db = await hiring();
  const { data: jobRows } = await db
    .from("jobs")
    .select("id, title")
    .order("created_at", { ascending: false });
  const jobs = (jobRows ?? []) as Array<{ id: string; title: string | null }>;
  const ids = jobs.map((j) => j.id);
  const stagesByJob = new Map<string, Array<{ id: string; name: string }>>();
  if (ids.length > 0) {
    const { data: stageRows } = await db
      .from("pipeline_stages")
      .select("id, job_id, name, position")
      .in("job_id", ids)
      .order("position", { ascending: true });
    for (const s of (stageRows ?? []) as Array<{
      id: string;
      job_id: string;
      name: string;
    }>) {
      const arr = stagesByJob.get(s.job_id) ?? [];
      arr.push({ id: s.id, name: s.name });
      stagesByJob.set(s.job_id, arr);
    }
  }
  return {
    ok: true,
    data: {
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title ?? "",
        stages: stagesByJob.get(j.id) ?? [],
      })),
    },
  };
}

export async function moveApplicationToStageAction(
  applicationId: string,
  stageId: string,
  options?: {
    /** Required when the target stage's category is 'rejected'. */
    rejectionReasonId?: string | null;
    /** Free-text rejection note (applications.rejection_reason). */
    rejectionNotes?: string | null;
  },
): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();

  // Pull stage.category too — applications.category is the cached
  // version used for kanban grouping + analytics, and was never being
  // synced on stage move (latent bug). We fix that here AND drive the
  // rejection-reason wiring off the same lookup.
  const { data: stage, error: stageErr } = await db
    .from("pipeline_stages")
    .select("id, job_id, category, workspace_id")
    .eq("id", stageId)
    .maybeSingle();
  if (stageErr || !stage) {
    return { ok: false, error: "Stage not found" };
  }

  const targetCategory = stage.category as string | null;
  const now = new Date().toISOString();

  // Capture the prior stage so the timeline event can read "X → Y".
  const { data: priorApp } = await db
    .from("applications")
    .select("stage_id")
    .eq("id", applicationId)
    .maybeSingle();
  const fromStageId = (priorApp?.stage_id as string | null) ?? null;

  // Reason wiring:
  //   - moving INTO 'rejected'  → persist the picked reason + notes.
  //   - leaving 'rejected'      → clear them.
  //   - any other transition    → leave the existing reason untouched
  //     so admins don't lose context if they pop a candidate back into
  //     rejected after a brief stage detour.
  const patch: Record<string, unknown> = {
    stage_id: stageId,
    category: targetCategory,
    // Stamp the stage-change time so "recent activity" ordering + the
    // AI context's "last stage change" reflect reality (was only set
    // at application creation — a latent staleness bug).
    status_changed_at: now,
    // Stage move invalidates the cached AI context — old status line
    // + next steps were computed against the previous stage and are
    // stale by definition. The slideover will prompt to regenerate.
    ai_status_line: null,
    ai_next_steps: null,
    ai_context_updated_at: null,
  };
  if (targetCategory === "rejected") {
    if (options?.rejectionReasonId !== undefined) {
      patch.rejection_reason_id = options.rejectionReasonId;
    }
    if (options?.rejectionNotes !== undefined) {
      patch.rejection_reason = options.rejectionNotes?.trim() || null;
    }
  } else {
    patch.rejection_reason_id = null;
    patch.rejection_reason = null;
  }

  const { error: updErr } = await db
    .from("applications")
    .update(patch)
    .eq("id", applicationId)
    .eq("job_id", stage.job_id as string);
  if (updErr) return { ok: false, error: updErr.message.slice(0, 300) };

  // Timeline event (best-effort — never fail the move over logging).
  if (fromStageId !== stageId) {
    await logApplicationEventBestEffort(db, {
      workspaceId: stage.workspace_id as string,
      applicationId,
      eventType: "stage_changed",
      payload: {
        from_stage_id: fromStageId,
        to_stage_id: stageId,
        to_category: targetCategory,
      },
      actor: await currentActorName(),
    });
  }

  revalidatePath(`/jobs/${stage.job_id as string}`);
  return { ok: true };
}

/** Human-readable actor string for application_events.actor (text). */
async function currentActorName(): Promise<string | null> {
  try {
    const me = await getCurrentUser();
    return me?.team_member?.full_name ?? null;
  } catch {
    return null;
  }
}

/** Insert an application_events row, swallowing failures — event
 *  logging must never break the user-facing mutation. */
async function logApplicationEventBestEffort(
  db: Awaited<ReturnType<typeof hiring>>,
  input: {
    workspaceId: string;
    applicationId: string;
    eventType: string;
    payload: Record<string, unknown> | null;
    actor: string | null;
  },
): Promise<void> {
  try {
    await db.from("application_events").insert({
      application_id: input.applicationId,
      event_type: input.eventType,
      payload: input.payload,
      actor: input.actor,
      workspace_id: input.workspaceId,
    });
  } catch {
    // best-effort
  }
}

/**
 * Batch version of moveApplicationToStageAction. Same per-row semantics
 * (sync category, manage rejection_reason_id + rejection_reason, clear
 * AI cache) applied across an array of applicationIds in a single
 * UPDATE. Used by the bulk-action toolbar on the kanban — picking
 * "Mover a Rechazado" with 12 cards selected should be one round trip,
 * not 12.
 *
 * Validates the stage exists, then enforces job_id match via the WHERE
 * clause so a malicious caller can't move someone else's applications
 * into their pipeline.
 */
export async function bulkMoveApplicationsAction(
  applicationIds: string[],
  stageId: string,
  options?: {
    rejectionReasonId?: string | null;
    rejectionNotes?: string | null;
  },
): Promise<ActionResult<{ moved: number }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const ids = Array.from(new Set(applicationIds)).filter(Boolean);
  if (ids.length === 0) return { ok: true, data: { moved: 0 } };

  const db = await hiring();
  const { data: stage, error: stageErr } = await db
    .from("pipeline_stages")
    .select("id, job_id, category, workspace_id")
    .eq("id", stageId)
    .maybeSingle();
  if (stageErr || !stage) return { ok: false, error: "Stage not found" };

  const targetCategory = stage.category as string | null;
  const now = new Date().toISOString();

  // Snapshot prior stages so each timeline event can read "X → Y".
  const { data: priorRows } = await db
    .from("applications")
    .select("id, stage_id")
    .in("id", ids)
    .eq("job_id", stage.job_id as string);
  const priorStageById = new Map<string, string | null>(
    (priorRows ?? []).map((r) => [
      r.id as string,
      (r.stage_id as string | null) ?? null,
    ]),
  );

  const patch: Record<string, unknown> = {
    stage_id: stageId,
    category: targetCategory,
    status_changed_at: now,
    ai_status_line: null,
    ai_next_steps: null,
    ai_context_updated_at: null,
  };
  if (targetCategory === "rejected") {
    if (options?.rejectionReasonId !== undefined) {
      patch.rejection_reason_id = options.rejectionReasonId;
    }
    if (options?.rejectionNotes !== undefined) {
      patch.rejection_reason = options.rejectionNotes?.trim() || null;
    }
  } else {
    patch.rejection_reason_id = null;
    patch.rejection_reason = null;
  }

  const { data, error } = await db
    .from("applications")
    .update(patch)
    .in("id", ids)
    // Pin to the stage's job so cross-job moves can't slip through.
    .eq("job_id", stage.job_id as string)
    .select("id");
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  // One timeline event per actually-moved application (best-effort).
  const movedIds = (data ?? []).map((r) => r.id as string);
  const actor = await currentActorName();
  await Promise.all(
    movedIds
      .filter((id) => priorStageById.get(id) !== stageId)
      .map((id) =>
        logApplicationEventBestEffort(db, {
          workspaceId: stage.workspace_id as string,
          applicationId: id,
          eventType: "stage_changed",
          payload: {
            from_stage_id: priorStageById.get(id) ?? null,
            to_stage_id: stageId,
            to_category: targetCategory,
          },
          actor,
        }),
      ),
  );

  revalidatePath(`/jobs/${stage.job_id as string}`);
  return { ok: true, data: { moved: movedIds.length } };
}

/**
 * Bulk-delete applications. Removes the recruiter's link between a
 * candidate and a vacante; the candidate row itself stays in the
 * talent pool. Notes, events, and stage history attached to the
 * application are wiped (ON DELETE CASCADE on those tables).
 *
 * Used by the kanban's bulk-action bar ("Eliminar de vacante")
 * and the candidate slideover's individual delete button.
 */
export async function bulkDeleteApplicationsAction(
  applicationIds: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const ids = Array.from(new Set(applicationIds)).filter(Boolean);
  if (ids.length === 0) return { ok: true, data: { deleted: 0 } };

  const db = await hiring();
  // Snapshot job_ids first so we know what to revalidate. RLS gates
  // visibility — IDs the recruiter can't see won't show up here, so
  // the delete below silently skips them too.
  const { data: rows } = await db
    .from("applications")
    .select("id, job_id")
    .in("id", ids);
  const seenIds = (rows ?? []).map((r) => r.id as string);
  const jobIds = new Set(
    (rows ?? []).map((r) => r.job_id as string),
  );
  if (seenIds.length === 0) return { ok: true, data: { deleted: 0 } };

  const { error } = await db.from("applications").delete().in("id", seenIds);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  for (const jobId of jobIds) revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  return { ok: true, data: { deleted: seenIds.length } };
}

/**
 * Toggle a kickoff-checklist task open ↔ done. The UI calls this from
 * the Paquete > Checklist tab. Status is the only patch — title/body
 * stay frozen to preserve the marker that lets us identify these as
 * kickoff-generated tasks down the road.
 */
export async function toggleKickoffTaskAction(input: {
  taskId: string;
  done: boolean;
}): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db
    .from("tasks")
    .update({
      status: input.done ? "done" : "open",
      completed_at: input.done ? new Date().toISOString() : null,
    })
    .eq("id", input.taskId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  // The checklist lives inside /jobs/[jobId]/paquete — revalidating
  // the path drops the cached count on next render.
  revalidatePath("/jobs");
  return { ok: true };
}

/**
 * Toggle a single SOP checkbox for a vacante. Thin wrapper over the
 * tasks toggle — kept separate so its revalidation target stays
 * narrow (the paquete page) and so we can evolve SOP behavior
 * independently of the legacy kickoff-checklist toggle.
 */
export async function toggleSopItemAction(input: {
  taskId: string;
  done: boolean;
}): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db
    .from("tasks")
    .update({
      status: input.done ? "done" : "open",
      completed_at: input.done ? new Date().toISOString() : null,
    })
    .eq("id", input.taskId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/jobs");
  return { ok: true };
}

/**
 * Workspace's active job closure reasons. Used by the closure dialog
 * when a job is being transitioned into an `is_archived=true` status.
 * Cheap query (7-ish system rows + any custom ones).
 */
export async function loadClosureReasonsAction(): Promise<
  ActionResult<Array<{ id: string; name: string }>>
> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { data, error } = await db
    .from("job_closure_reasons")
    .select("id, name")
    .eq("is_active", true)
    .order("position", { ascending: true });
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
    })),
  };
}

/**
 * Workspace's active rejection reasons. Used by the rejection picker
 * dialog when an application is being dropped into a rejected stage.
 * Cheap query (20-ish system rows per workspace + any custom ones).
 */
export async function loadRejectionReasonsAction(): Promise<
  ActionResult<Array<{ id: string; name: string }>>
> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { data, error } = await db
    .from("rejection_reasons")
    .select("id, name")
    .eq("is_active", true)
    .order("position", { ascending: true });
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
    })),
  };
}

// Best-effort: derive a canonical domain from a website string.
// Accepts "example.com", "https://www.Example.COM/path", "http://x.example.com" → "example.com" (the last preserves subdomain only when it's not www).
function deriveDomain(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  const withProto = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function createCompanyAction(input: {
  name: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  status?: CompanyStatus;
}): Promise<ActionResult<{ companyId: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Company name is required" };

  const website = input.websiteUrl?.trim() || null;
  const domainSource = website ?? (name.includes(".") && !name.includes(" ") ? name : null);
  const domain = domainSource ? deriveDomain(domainSource) : null;
  const websiteCanonical = domain ? `https://${domain}` : website;
  // Company logos are not used anywhere in the product — we render the
  // company name only. Keep the column as null on insert.
  const logoUrl = null;

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Dedupe by domain within the current workspace.
  if (domain) {
    const { data: existing } = await db
      .from("companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("domain", domain)
      .maybeSingle();
    if (existing) {
      return { ok: true, data: { companyId: existing.id as string } };
    }
  }

  // No DB-level status default anymore — resolve the workspace's first
  // status when the caller didn't pick one.
  const statusKey =
    input.status ?? (await resolveDefaultCompanyStatusKey());
  if (!statusKey) {
    const t = await getT();
    return { ok: false, error: t("errors.noCompanyStatusesConfigured") };
  }

  const { data, error } = await db
    .from("companies")
    .insert({
      workspace_id: workspaceId,
      name,
      domain,
      website_url: websiteCanonical,
      linkedin_url: input.linkedinUrl?.trim() || null,
      logo_url: logoUrl,
      status: statusKey,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "Failed to create company",
    };
  }

  const actor = await getCurrentUser();
  await logCompanyEventBestEffort({
    workspaceId,
    companyId: data.id as string,
    actorTeamMemberId: actor?.team_member.id ?? null,
    kind: "created",
    summary: `Empresa "${name}" creada`,
  });

  revalidatePath("/companies");
  return { ok: true, data: { companyId: data.id as string } };
}

/**
 * Insert a row into hiring.company_events. Best-effort — a failure
 * here never blocks the main action (the audit trail is nice-to-have,
 * not a transactional invariant). RLS enforces workspace + admin-only
 * inserts.
 */
async function logCompanyEventBestEffort(input: {
  workspaceId: string;
  companyId: string;
  actorTeamMemberId: string | null;
  kind: string;
  summary: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await hiring();
    await db.from("company_events").insert({
      workspace_id: input.workspaceId,
      company_id: input.companyId,
      actor_team_member_id: input.actorTeamMemberId,
      kind: input.kind,
      summary: input.summary,
      payload: input.payload ?? null,
    });
  } catch {
    // Swallow — the activity log isn't load-bearing.
  }
}

export async function searchCompaniesAction(
  query: string,
  limit = 10,
): Promise<{ ok: true; data: Array<{ id: string; name: string; domain: string | null; logo_url: string | null; status: CompanyStatus }> } | { ok: false; error: string }> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const q = query.trim();
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  let req = db
    .from("companies")
    .select("id, name, domain, logo_url, status")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true })
    .limit(limit);
  if (q) {
    req = req.ilike("name", `%${q}%`);
  }
  const { data, error } = await req;
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    data: (data ?? []) as Array<{
      id: string;
      name: string;
      domain: string | null;
      logo_url: string | null;
      status: CompanyStatus;
    }>,
  };
}

export async function updateCompanyStatusAction(
  companyId: string,
  status: CompanyStatus,
): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
  // Read the prior status so the event summary can read "X → Y"
  // instead of just "→ Y" with no context.
  const { data: prior } = await db
    .from("companies")
    .select("status")
    .eq("id", companyId)
    .maybeSingle();
  const { error } = await db
    .from("companies")
    .update({ status })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (!prior || prior.status !== status) {
    const workspaceId = await getRequestWorkspaceId();
    const actor = await getCurrentUser();
    // Resolve human labels from the workspace's statuses (keys are
    // slugs now). Falls back to the key if a row was since deleted.
    const keys = [prior?.status, status].filter(Boolean) as string[];
    const { data: labelRows } = await db
      .from("company_statuses")
      .select("key, label")
      .in("key", keys);
    const labelOf = (k: string | null | undefined) =>
      labelRows?.find((r) => r.key === k)?.label ?? k ?? "—";
    await logCompanyEventBestEffort({
      workspaceId,
      companyId,
      actorTeamMemberId: actor?.team_member.id ?? null,
      kind: "status_changed",
      summary: prior?.status
        ? `Estado: ${labelOf(prior.status)} → ${labelOf(status)}`
        : `Estado: ${labelOf(status)}`,
      payload: { from: prior?.status ?? null, to: status },
    });
  }
  revalidatePath("/companies");
  return { ok: true };
}

/**
 * Partial update for an existing company. Each field is optional —
 * the slideover commits one field at a time (autosave on blur), and
 * this action ignores any key the caller didn't include.
 *
 * The website→domain coupling from createCompanyAction is preserved:
 * if the website changes, the canonical website + derived domain on
 * the row get rebuilt from the new input. This keeps logo lookups
 * (favicons by domain) coherent with what the user actually entered.
 *
 * Empty strings become NULL so display logic can keep using "—" /
 * <Empty> fallbacks without juggling both representations.
 */
export async function updateCompanyAction(input: {
  companyId: string;
  name?: string;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  industry?: string | null;
  sizeRange?: string | null;
  hqLocation?: string | null;
  description?: string | null;
  /** Customizable Source/Origen (FK to hiring.sources, company scope). */
  sourceId?: string | null;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;

  const patch: Record<string, unknown> = {};
  if (input.sourceId !== undefined) patch.source_id = input.sourceId || null;

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      const t = await getT();
      return { ok: false, error: t("errors.nameRequired") };
    }
    if (trimmed.length > 120) {
      const t = await getT();
      return { ok: false, error: t("errors.nameTooLong120") };
    }
    patch.name = trimmed;
  }

  if (input.websiteUrl !== undefined) {
    // Mirror createCompanyAction's normalization: derive a clean
    // domain from the entered URL and canonicalize to https://<domain>.
    // Empty input clears both columns so the row doesn't keep a stale
    // domain after the user wipes the website.
    const trimmed = (input.websiteUrl ?? "").trim();
    if (trimmed === "") {
      patch.website_url = null;
      patch.domain = null;
    } else {
      const domain = deriveDomain(trimmed);
      patch.website_url = domain ? `https://${domain}` : trimmed;
      patch.domain = domain;
    }
  }

  if (input.linkedinUrl !== undefined) {
    const t = (input.linkedinUrl ?? "").trim();
    patch.linkedin_url = t === "" ? null : t;
  }
  if (input.industry !== undefined) {
    const t = (input.industry ?? "").trim();
    patch.industry = t === "" ? null : t;
  }
  if (input.sizeRange !== undefined) {
    const t = (input.sizeRange ?? "").trim();
    patch.size_range = t === "" ? null : t;
  }
  if (input.hqLocation !== undefined) {
    const t = (input.hqLocation ?? "").trim();
    patch.hq_location = t === "" ? null : t;
  }
  if (input.description !== undefined) {
    const t = (input.description ?? "").trim();
    patch.description = t === "" ? null : t;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await (await hiring())
    .from("companies")
    .update(patch)
    .eq("id", input.companyId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  // Log one event per save with a human-friendly summary of which
  // fields the user touched. We don't log the actual values to avoid
  // bloating the feed and accidentally surfacing sensitive edits.
  const fieldLabelEs: Record<string, string> = {
    name: "Nombre",
    website_url: "Sitio web",
    domain: "Dominio",
    linkedin_url: "LinkedIn",
    industry: "Industria",
    size_range: "Tamaño",
    hq_location: "Sede",
    description: "Descripción",
  };
  const touched = Object.keys(patch)
    .map((k) => fieldLabelEs[k])
    .filter(Boolean);
  if (touched.length > 0) {
    const workspaceId = await getRequestWorkspaceId();
    const actor = await getCurrentUser();
    await logCompanyEventBestEffort({
      workspaceId,
      companyId: input.companyId,
      actorTeamMemberId: actor?.team_member.id ?? null,
      kind: "updated",
      summary: `Actualizó ${touched.join(", ")}`,
      payload: { fields: Object.keys(patch) },
    });
  }

  revalidatePath("/companies");
  return { ok: true };
}

/**
 * Upload a logo for an existing company. Public bucket — the URL
 * goes straight onto `companies.logo_url` and is served as-is across
 * the app. Replaces the previous logo if any (cleans the old blob).
 *
 * Storage RLS only checks `authenticated`; per-row ownership is
 * enforced here: we verify the company belongs to the caller's
 * workspace before touching anything.
 */
export async function uploadCompanyLogoAction(
  formData: FormData,
): Promise<ActionResult<{ logoUrl: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;

  const t = await getT();
  const companyId = String(formData.get("company_id") ?? "");
  const file = formData.get("file");
  if (!companyId) return { ok: false, error: t("errors.missingCompanyId") };
  if (!(file instanceof File)) {
    return { ok: false, error: t("errors.missingFile") };
  }
  if (file.size === 0) return { ok: false, error: t("errors.fileEmpty") };
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: t("errors.fileExceeds2mb") };
  }

  const workspaceId = await getRequestWorkspaceId();
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");

  // Verify the company is in this workspace before writing anything.
  // RLS would also block it but we want a clean error path.
  const { data: comp } = await db
    .from("companies")
    .select("workspace_id, logo_url")
    .eq("id", companyId)
    .maybeSingle();
  if (!comp || comp.workspace_id !== workspaceId) {
    return { ok: false, error: t("errors.companyNotFound") };
  }
  const prevUrl = (comp.logo_url as string | null) ?? null;

  // Derive a stable path keyed by company id; the timestamp makes the
  // URL unique per upload so we don't have to bust client/browser caches.
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
  const path = `${workspaceId}/${companyId}/logo-${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(COMPANY_LOGO_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { ok: false, error: upErr.message.slice(0, 300) };

  const {
    data: { publicUrl },
  } = supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(path);

  const { error: updErr } = await db
    .from("companies")
    .update({ logo_url: publicUrl })
    .eq("id", companyId);
  if (updErr) {
    // Roll back the freshly-uploaded blob so we don't orphan it.
    await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([path]);
    return { ok: false, error: updErr.message.slice(0, 300) };
  }

  // Clean up the previous logo's blob — best-effort. We can only do
  // this when the URL points at our bucket (skip Clearbit favicons).
  if (prevUrl && prevUrl !== publicUrl) {
    const prevPath = extractCompanyLogoStoragePath(prevUrl);
    if (prevPath) {
      await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([prevPath]);
    }
  }

  const actor = await getCurrentUser();
  await logCompanyEventBestEffort({
    workspaceId,
    companyId,
    actorTeamMemberId: actor?.team_member.id ?? null,
    kind: "updated",
    summary: "Actualizó el logo",
    payload: { fields: ["logo_url"] },
  });

  revalidatePath("/companies");
  return { ok: true, data: { logoUrl: publicUrl } };
}

/**
 * Enrich a company by its DOMAIN via /enrich/company (domain → slug,
 * with a domain-match guard so a wrong slug never materializes another
 * company's data). Explicit user click → force:true so it runs even on
 * a fresh row. Returns the outcome for the UI to phrase a toast.
 */
export async function enrichCompanyByDomainAction(input: {
  companyId: string;
  live?: boolean;
}): Promise<
  ActionResult<{
    status:
      | "enriched"
      | "low_confidence"
      | "no_match"
      | "skipped"
      | "invalid_domain"
      | "not_found";
    matchConfidence: number | null;
    alternativesCount: number;
    creditsUsed: number;
  }>
> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();

  const { data: comp } = await db
    .from("companies")
    .select("domain")
    .eq("id", input.companyId)
    .maybeSingle();
  const domain = (comp?.domain as string | null) ?? null;
  if (!domain) {
    const t = await getT();
    return {
      ok: false,
      error: t("errors.companyNoDomain"),
    };
  }

  try {
    const { enrichCompanyByDomain } = await import("@/lib/sourcing/dataforb2b");
    const actor = await getCurrentUser();
    const res = await enrichCompanyByDomain(domain, {
      companyId: input.companyId,
      live: input.live,
      force: true, // explicit click — run even if recently enriched
      userId: actor?.team_member.id,
    });

    const workspaceId = await getRequestWorkspaceId();
    if (res.status === "enriched") {
      await logCompanyEventBestEffort({
        workspaceId,
        companyId: input.companyId,
        actorTeamMemberId: actor?.team_member.id ?? null,
        kind: "enriched",
        summary: `Enriqueció por dominio (DfB2B) — confianza ${Math.round((res.matchConfidence ?? 0) * 100)}%`,
        payload: { source: "dataforb2b", by: "domain", domain },
      });
    } else if (res.status === "low_confidence") {
      await logCompanyEventBestEffort({
        workspaceId,
        companyId: input.companyId,
        actorTeamMemberId: actor?.team_member.id ?? null,
        kind: "enriched",
        summary: `DfB2B: match de baja confianza (${res.alternativesCount} alternativa(s) para revisar)`,
        payload: { source: "dataforb2b", by: "domain", outcome: "low_confidence" },
      });
    } else if (res.status === "no_match") {
      await logCompanyEventBestEffort({
        workspaceId,
        companyId: input.companyId,
        actorTeamMemberId: actor?.team_member.id ?? null,
        kind: "enriched",
        summary: "DfB2B: sin coincidencia para este dominio",
        payload: { source: "dataforb2b", by: "domain", outcome: "no_match" },
      });
    }

    revalidatePath("/companies");
    return {
      ok: true,
      data: {
        status: res.status,
        matchConfidence: res.matchConfidence,
        alternativesCount: res.alternativesCount,
        creditsUsed: res.creditsUsed,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 300) };
  }
}

/** Clear a company's logo and remove the underlying blob (if ours). */
export async function removeCompanyLogoAction(input: {
  companyId: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");

  const { data: comp } = await db
    .from("companies")
    .select("workspace_id, logo_url")
    .eq("id", input.companyId)
    .maybeSingle();
  if (!comp || comp.workspace_id !== workspaceId) {
    const t = await getT();
    return { ok: false, error: t("errors.companyNotFound") };
  }
  const prevUrl = (comp.logo_url as string | null) ?? null;

  const { error } = await db
    .from("companies")
    .update({ logo_url: null })
    .eq("id", input.companyId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  if (prevUrl) {
    const prevPath = extractCompanyLogoStoragePath(prevUrl);
    if (prevPath) {
      await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([prevPath]);
    }
  }

  const actor = await getCurrentUser();
  await logCompanyEventBestEffort({
    workspaceId,
    companyId: input.companyId,
    actorTeamMemberId: actor?.team_member.id ?? null,
    kind: "updated",
    summary: "Quitó el logo",
    payload: { fields: ["logo_url"] },
  });

  revalidatePath("/companies");
  return { ok: true };
}

/**
 * Extract the storage path from a public URL for the company-logos
 * bucket. Returns null for any URL outside our bucket (e.g. legacy
 * Clearbit favicons) so we never try to delete blobs we don't own.
 */
function extractCompanyLogoStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${COMPANY_LOGO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

/**
 * Wipe ALL enrichment-derived data from a company, back to a clean
 * slate. Used when DfB2B matched the wrong company (e.g. Birdman
 * pulled an unrelated brand's firmographics) and the row needs to be
 * reset so the recruiter can re-enter identity by hand or re-enrich
 * against the correct LinkedIn URL.
 *
 * Aggressive scope (per the user's choice): nulls firmographics AND
 * the identity fields DfB2B can touch (website, domain, linkedin).
 * KEEPS: name, status, custom fields, notes, contacts/deals links —
 * none of which come from enrichment.
 *
 * If the logo points at our own storage bucket, the blob is removed
 * too so we don't orphan it.
 */
export async function clearCompanyEnrichmentAction(input: {
  companyId: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");

  const { data: comp } = await db
    .from("companies")
    .select("workspace_id, logo_url")
    .eq("id", input.companyId)
    .maybeSingle();
  if (!comp || comp.workspace_id !== workspaceId) {
    const t = await getT();
    return { ok: false, error: t("errors.companyNotFound") };
  }

  const { error } = await db
    .from("companies")
    .update({
      // firmographics
      industry: null,
      size_range: null,
      employee_count: null,
      founded_year: null,
      company_type: null,
      description: null,
      logo_url: null,
      hq_location: null,
      hq_city: null,
      hq_country: null,
      // identity DfB2B can touch
      website_url: null,
      domain: null,
      linkedin_url: null,
      linkedin_id: null,
      // enrichment bookkeeping — back to "never enriched"
      dfb2b_id: null,
      enrichment_status: null,
      enrichment_source: null,
      enriched_at: null,
      next_refresh_at: null,
    })
    .eq("id", input.companyId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  // Best-effort: drop the logo blob if it was one of ours.
  const prevUrl = (comp.logo_url as string | null) ?? null;
  if (prevUrl) {
    const prevPath = extractCompanyLogoStoragePath(prevUrl);
    if (prevPath) {
      await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([prevPath]);
    }
  }

  const actor = await getCurrentUser();
  await logCompanyEventBestEffort({
    workspaceId,
    companyId: input.companyId,
    actorTeamMemberId: actor?.team_member.id ?? null,
    kind: "updated",
    summary: "Limpió los datos de enriquecimiento",
    payload: { cleared: "enrichment" },
  });

  revalidatePath("/companies");
  return { ok: true };
}

// ============================================================
// Resume upload (Supabase Storage, private bucket, signed URLs)
// ============================================================

export async function uploadResumeAction(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const candidateId = String(formData.get("candidate_id") ?? "");
  const file = formData.get("file");
  if (!candidateId) return { ok: false, error: "Missing candidate id" };
  if (!(file instanceof File)) return { ok: false, error: "Missing file" };
  if (file.size === 0) return { ok: false, error: "File is empty" };
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "File exceeds 10 MB limit" };
  }

  const workspaceId = await getRequestWorkspaceId();
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");

  // Verify the candidate belongs to the user's workspace (RLS makes
  // this a no-op for cross-workspace IDs, but we want a clear error).
  const { data: candCheck } = await db
    .from("candidates")
    .select("workspace_id, resume_url")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candCheck) return { ok: false, error: "Candidate not found" };
  const prevPath = (candCheck.resume_url as string | null) ?? null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const path = `${workspaceId}/${candidateId}/${Date.now()}_${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(RESUME_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) {
    return { ok: false, error: upErr.message.slice(0, 300) };
  }

  const { error: updErr } = await db
    .from("candidates")
    .update({ resume_url: path })
    .eq("id", candidateId);
  if (updErr) {
    // Roll back the just-uploaded blob to avoid orphan files.
    await supabase.storage.from(RESUME_BUCKET).remove([path]);
    return { ok: false, error: updErr.message.slice(0, 300) };
  }
  if (prevPath && prevPath !== path) {
    await supabase.storage.from(RESUME_BUCKET).remove([prevPath]);
  }

  const revalidate = String(formData.get("revalidate") ?? "");
  if (revalidate) revalidatePath(revalidate);
  return { ok: true, data: { path } };
}

export async function deleteResumeAction(input: {
  candidateId: string;
  revalidate?: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");
  const { data } = await db
    .from("candidates")
    .select("resume_url")
    .eq("id", input.candidateId)
    .maybeSingle();
  const path = (data?.resume_url as string | null) ?? null;
  if (path) {
    await supabase.storage.from(RESUME_BUCKET).remove([path]);
  }
  const { error } = await db
    .from("candidates")
    .update({ resume_url: null })
    .eq("id", input.candidateId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

export async function parseResumeAction(input: {
  candidateId: string;
  /** When true, only fills empty candidate fields. Default true. */
  fillOnlyEmpty?: boolean;
  revalidate?: string;
}): Promise<ActionResult<{ parsed: ParsedProfile }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "Set ANTHROPIC_API_KEY in .env.local to enable resume parsing.",
    };
  }
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");
  const { data: cand, error: candErr } = await db
    .from("candidates")
    .select("id, full_name, email, phone, linkedin_url, resume_url")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (candErr || !cand) {
    return { ok: false, error: candErr?.message.slice(0, 300) || "Not found" };
  }
  const path = cand.resume_url as string | null;
  if (!path) return { ok: false, error: "No resume on file" };

  const { data: blob, error: dlErr } = await supabase.storage
    .from(RESUME_BUCKET)
    .download(path);
  if (dlErr || !blob) {
    return { ok: false, error: dlErr?.message.slice(0, 300) || "Download failed" };
  }

  // Only PDFs are supported by pdf-parse. DOCX path can come later.
  const ct = blob.type || "";
  if (!ct.includes("pdf") && !path.toLowerCase().endsWith(".pdf")) {
    return {
      ok: false,
      error: "Only PDF parsing is supported right now (DOCX coming soon).",
    };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  // pdf-parse v1: import the inner module directly. The package's index.js
  // runs a debug test on load that ENOENTs on the bundled sample file.
  type PdfParseFn = (
    data: Buffer,
  ) => Promise<{ text: string; numpages: number; info: unknown }>;
  // @ts-expect-error — no types for the inner path; we know the shape.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse: PdfParseFn =
    typeof mod === "function"
      ? (mod as PdfParseFn)
      : ((mod as { default: PdfParseFn }).default as PdfParseFn);
  let resumeText = "";
  try {
    const result = await pdfParse(Buffer.from(bytes));
    resumeText = result.text ?? "";
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : "PDF parse failed",
    };
  }
  if (!resumeText.trim()) {
    return { ok: false, error: "No extractable text in PDF (scanned image?)" };
  }

  let parsed: ParsedProfile;
  try {
    parsed = await parseResumeText(resumeText);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : "AI parse failed",
    };
  }

  // Build the patch: by default only fill blanks so we don't overwrite
  // recruiter-edited fields.
  const fillOnlyEmpty = input.fillOnlyEmpty ?? true;
  const patch: Record<string, unknown> = {
    parsed_profile: parsed,
    resume_text: resumeText.slice(0, 200_000),
  };
  function maybeFill(key: string, current: unknown, next: unknown) {
    if (next == null || (typeof next === "string" && !next.trim())) return;
    if (fillOnlyEmpty && current) return;
    patch[key] = next;
  }
  maybeFill("full_name", cand.full_name, parsed.full_name);
  maybeFill("email", cand.email, parsed.email);
  maybeFill("phone", cand.phone, parsed.phone);
  maybeFill("linkedin_url", cand.linkedin_url, parsed.linkedin_url);

  const { error: updErr } = await db
    .from("candidates")
    .update(patch)
    .eq("id", input.candidateId);
  if (updErr) {
    return { ok: false, error: updErr.message.slice(0, 300) };
  }
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true, data: { parsed } };
}

export async function getResumeSignedUrlAction(
  candidateId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .schema("hiring")
    .from("candidates")
    .select("resume_url")
    .eq("id", candidateId)
    .maybeSingle();
  const path = (data?.resume_url as string | null) ?? null;
  if (!path) return { ok: false, error: "No resume on file" };
  const { data: signed, error } = await supabase
    .storage.from(RESUME_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !signed?.signedUrl) {
    return {
      ok: false,
      error: error?.message?.slice(0, 300) || "Failed to sign URL",
    };
  }
  return { ok: true, url: signed.signedUrl };
}

// ============================================================
// Tags
// ============================================================

const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#94a3b8",
];

/** Validate a #rrggbb (or #rgb) hex string; null otherwise. */
function sanitizeHexOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? t : null;
}

function pickTagColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export async function listTagsAction(): Promise<
  | { ok: true; data: Array<{ id: string; name: string; color: string | null }> }
  | { ok: false; error: string }
> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const { data, error } = await (await hiring())
    .from("tags")
    .select("id, name, color")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    data: (data ?? []) as Array<{
      id: string;
      name: string;
      color: string | null;
    }>,
  };
}

export async function createTagAction(
  name: string,
): Promise<ActionResult<{ tagId: string; name: string; color: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Tag name is required" };

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  // Dedupe by lowercase name within the workspace.
  const { data: existing } = await db
    .from("tags")
    .select("id, name, color")
    .eq("workspace_id", workspaceId)
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      data: {
        tagId: existing.id as string,
        name: existing.name as string,
        color: (existing.color as string) ?? pickTagColor(trimmed),
      },
    };
  }

  const color = pickTagColor(trimmed);
  const { data, error } = await db
    .from("tags")
    .insert({ workspace_id: workspaceId, name: trimmed, color })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "Failed to create tag",
    };
  }
  return {
    ok: true,
    data: { tagId: data.id as string, name: trimmed, color },
  };
}

export async function applyTagAction(input: {
  tagId: string;
  entityType: "candidate" | "application" | "job" | "company" | "contact" | "deal";
  entityId: string;
  revalidate?: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  // INSERT … ON CONFLICT DO NOTHING via upsert (composite PK handles dedupe).
  const { error } = await (await hiring())
    .from("entity_tags")
    .upsert(
      {
        workspace_id: workspaceId,
        tag_id: input.tagId,
        entity_type: input.entityType,
        entity_id: input.entityId,
      },
      { onConflict: "tag_id,entity_type,entity_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

export async function removeTagAction(input: {
  tagId: string;
  entityType: "candidate" | "application" | "job" | "company" | "contact" | "deal";
  entityId: string;
  revalidate?: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { error } = await (await hiring())
    .from("entity_tags")
    .delete()
    .eq("tag_id", input.tagId)
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

/**
 * Rename / recolor a workspace tag. Admin-only. Changes propagate
 * everywhere the tag is applied since entity_tags only stores the
 * tag_id (the name/color live on the tags row).
 */
export async function updateTagAction(input: {
  tagId: string;
  name?: string;
  color?: string | null;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const t = await getT();
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: t("errors.nameRequired") };
    if (trimmed.length > 40) return { ok: false, error: t("errors.max40Chars") };
    // Reject a rename that would collide with another tag in the
    // workspace (case-insensitive) — keeps the inline-create dedupe
    // honest.
    const { data: clash } = await db
      .from("tags")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("name", trimmed)
      .neq("id", input.tagId)
      .maybeSingle();
    if (clash) return { ok: false, error: t("errors.tagNameExists") };
    patch.name = trimmed;
  }
  if (input.color !== undefined) {
    patch.color = sanitizeHexOrNull(input.color);
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await db
    .from("tags")
    .update(patch)
    .eq("id", input.tagId)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/tags");
  return { ok: true };
}

/**
 * Delete a workspace tag. entity_tags.tag_id has ON DELETE CASCADE,
 * so every application of this tag across candidates / applications /
 * etc. is removed automatically. Irreversible — the caller confirms.
 */
export async function deleteTagAction(input: {
  tagId: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const { error } = await (await hiring())
    .from("tags")
    .delete()
    .eq("id", input.tagId)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/tags");
  return { ok: true };
}

export async function createNoteAction(input: {
  entityType: "candidate" | "application" | "job" | "company" | "contact" | "deal";
  entityId: string;
  body: string;
  // Optional: revalidate this path after insert.
  revalidate?: string;
}): Promise<ActionResult<{ noteId: string }>> {
  // Any authenticated team member can leave a note (recruiters and
  // admins alike). Delete is admin-only — see deleteNoteAction below.
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note cannot be empty" };
  const workspaceId = await getRequestWorkspaceId();
  const { data, error } = await (await hiring())
    .from("notes")
    .insert({
      workspace_id: workspaceId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      body,
      // Stamp the author so the notes UI can show "Eman · hace 5 min"
      // — without this, notes always rendered anonymous.
      author_id: me.team_member.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "Failed to create note",
    };
  }
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true, data: { noteId: data.id as string } };
}

export async function deleteNoteAction(input: {
  noteId: string;
  revalidate?: string;
}): Promise<ActionResult> {
  // Admin-only — recruiters can read + create notes but not erase them
  // (audit trail concern: a recruiter shouldn't be able to scrub their
  // own internal commentary on a candidate after the fact).
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const { error } = await (await hiring())
    .from("notes")
    .delete()
    .eq("id", input.noteId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

// ============================================================
// Bulk CV upload — Phase 1
// ============================================================

/**
 * Extract text from a PDF in memory using pdf-parse. Mirrors the loader
 * pattern in parseResumeAction (deep import to bypass the package's
 * debug-test at module load time).
 */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  type PdfParseFn = (
    data: Buffer,
  ) => Promise<{ text: string; numpages: number; info: unknown }>;
  // @ts-expect-error — no types for the inner path; we know the shape.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse: PdfParseFn =
    typeof mod === "function"
      ? (mod as PdfParseFn)
      : ((mod as { default: PdfParseFn }).default as PdfParseFn);
  const result = await pdfParse(Buffer.from(bytes));
  return result.text ?? "";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

/**
 * Phase 1 of the bulk flow. Parses N PDFs and builds the conflict report.
 * Each successfully-parsed PDF is left staged at `_pending/<nanoid>/...`
 * until the user resolves conflicts and calls commitBulkCVsAction.
 */
export async function bulkParseCVsAction(
  formData: FormData,
): Promise<ActionResult<BulkParseResult>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const t = await getT();
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "Set ANTHROPIC_API_KEY in .env.local to enable resume parsing.",
    };
  }

  const files = formData.getAll("cvs").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return { ok: false, error: "No files provided" };
  }
  if (files.length > BULK_MAX_FILES) {
    return {
      ok: false,
      error: t("errors.bulkMaxFiles", { max: BULK_MAX_FILES }),
    };
  }

  const workspaceId = await getRequestWorkspaceId();
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");

  const items: BulkParseItem[] = [];
  const failed: BulkFailedItem[] = [];

  // Sequential to avoid hammering the Anthropic rate limit.
  for (const file of files) {
    if (file.size === 0) {
      failed.push({ filename: file.name, reason: t("errors.cvEmpty") });
      continue;
    }
    if (file.size > BULK_MAX_FILE_BYTES) {
      failed.push({
        filename: file.name,
        reason: t("errors.cvExceedsMb", {
          mb: Math.round(BULK_MAX_FILE_BYTES / 1024 / 1024),
        }),
      });
      continue;
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      failed.push({ filename: file.name, reason: t("errors.cvOnlyPdf") });
      continue;
    }

    const tempId = crypto.randomUUID();
    const safeName = sanitizeFilename(file.name);
    const storagePath = `${workspaceId}/_pending/${tempId}/${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    // 1. Upload to _pending.
    const { error: upErr } = await supabase.storage
      .from(RESUME_BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
    if (upErr) {
      failed.push({
        filename: file.name,
        reason: upErr.message.slice(0, 200),
      });
      continue;
    }

    // 2. Extract text.
    let text = "";
    try {
      text = await extractPdfText(bytes);
    } catch (e) {
      await supabase.storage.from(RESUME_BUCKET).remove([storagePath]);
      failed.push({
        filename: file.name,
        reason:
          e instanceof Error ? e.message.slice(0, 200) : t("errors.cvInvalidPdf"),
      });
      continue;
    }
    if (!text.trim()) {
      await supabase.storage.from(RESUME_BUCKET).remove([storagePath]);
      failed.push({
        filename: file.name,
        reason: t("errors.cvNoText"),
      });
      continue;
    }

    // 3. Parse with Claude.
    let parsed: ParsedProfile;
    try {
      parsed = await parseResumeText(text);
    } catch (e) {
      await supabase.storage.from(RESUME_BUCKET).remove([storagePath]);
      failed.push({
        filename: file.name,
        reason:
          e instanceof Error
            ? e.message.slice(0, 200)
            : t("errors.cvParseFailed"),
      });
      continue;
    }

    items.push({ tempId, filename: file.name, storagePath, parsed });
  }

  // ============================================================
  // Dedup
  // ============================================================
  // Group items by normalized email.
  const byEmail = new Map<string, BulkParseItem[]>();
  for (const it of items) {
    const e = it.parsed.email?.trim().toLowerCase();
    if (!e) continue;
    const arr = byEmail.get(e) ?? [];
    arr.push(it);
    byEmail.set(e, arr);
  }

  // Fetch existing candidates with matching emails (workspace-scoped by RLS).
  const emails = Array.from(byEmail.keys());
  const existingByEmail = new Map<string, BulkConflictGroup["existing"]>();
  if (emails.length > 0) {
    const { data: existing } = await db
      .from("candidates")
      .select("id, full_name, email, phone, linkedin_url, parsed_profile")
      .in("email", emails);
    for (const c of (existing ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      linkedin_url: string | null;
      parsed_profile: unknown;
    }>) {
      if (!c.email) continue;
      existingByEmail.set(c.email.toLowerCase(), {
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        linkedin_url: c.linkedin_url,
        parsed_profile: c.parsed_profile as ParsedProfile | null,
      });
    }
  }

  const conflicts: BulkConflictGroup[] = [];
  for (const [email, group] of byEmail.entries()) {
    const existing = existingByEmail.get(email) ?? null;
    // A "conflict" is when there are 2+ items in batch OR an existing match.
    if (group.length >= 2 || existing) {
      conflicts.push({
        groupId: crypto.randomUUID(),
        email,
        items: group,
        existing,
      });
    }
  }

  return { ok: true, data: { items, failed, conflicts } };
}

/**
 * Phase 2 of the bulk flow. Takes the user's decisions (post-resolution
 * UI) and writes candidates + applications. PDFs move from `_pending/`
 * to their final `{workspace_id}/{candidate_id}/...` path.
 */
/**
 * Bulk-commit parsed CVs. When `jobId` is provided, each new
 * candidate also gets an application in that job's first stage
 * (the per-vacante flow). When omitted, candidates land in the
 * talent pool only — same parsing / merging / conflict resolution,
 * just no applications. The /candidates "Agregar candidatos >
 * Importar CVs" entry uses the talent-pool mode.
 */
export async function commitBulkCVsAction(input: {
  jobId?: string;
  items: BulkParseItem[];
  decisions: BulkCommitDecision[];
  /** Candidate source + target stage chosen in the add-candidates flow. */
  source?: CandidateSource;
  stageId?: string | null;
}): Promise<ActionResult<BulkCommitResult>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const t = await getT();
  // Stamp the bulk-imported candidates with the team member who
  // ran the import so recruiters can still see talent-pool imports
  // they did themselves (Q1 option C).
  const createdByTeamMemberId = guard.data.id;

  const workspaceId = await getRequestWorkspaceId();
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");

  // Job mode: resolve the target stage (the one the user picked, else
  // the first stage). Talent-pool mode skips this entirely.
  let firstStageId: string | null = null;
  if (input.jobId) {
    firstStageId = await resolveTargetStageId(
      db,
      workspaceId,
      input.jobId,
      input.stageId,
    );
  }
  const appSource: CandidateSource = input.source ?? "bulk_import";

  const itemById = new Map(input.items.map((i) => [i.tempId, i]));
  const result: BulkCommitResult = { created: 0, updated: 0, errors: [] };

  // Track which storage paths to clean up at the end (anything in _pending
  // that wasn't moved to its final path).
  const orphanPaths: string[] = [];

  async function moveStorageToFinal(
    item: BulkParseItem,
    candidateId: string,
  ): Promise<string | null> {
    const filename = item.storagePath.split("/").pop() ?? "cv.pdf";
    const finalPath = `${workspaceId}/${candidateId}/${Date.now()}_${filename}`;
    const { error } = await supabase.storage
      .from(RESUME_BUCKET)
      .move(item.storagePath, finalPath);
    if (error) return null;
    return finalPath;
  }

  async function createApplication(candidateId: string): Promise<string | null> {
    // Talent-pool mode (no jobId): no application to create.
    if (!input.jobId) return null;
    const { error } = await db.from("applications").insert({
      workspace_id: workspaceId,
      candidate_id: candidateId,
      job_id: input.jobId,
      source: appSource,
      stage_id: firstStageId,
    });
    if (error) return error.message.slice(0, 200);
    return null;
  }

  function buildCandidatePatch(
    primary: BulkParseItem,
    extras: BulkParseItem[],
    overrides: ResolvedScalarFields,
  ) {
    // Start from primary's parsed profile, optionally overridden by the
    // user's chosen scalars. Arrays are merged across all items.
    const primaryP = primary.parsed;
    const mergedSkills = extras.reduce(
      (acc, it) => mergeStringArrays(acc, it.parsed.skills ?? []),
      primaryP.skills ?? [],
    );
    const mergedLanguages = extras.reduce(
      (acc, it) => mergeStringArrays(acc, it.parsed.languages ?? []),
      primaryP.languages ?? [],
    );
    // Experience + education: concat with naive dedup by (company+title) /
    // (school+degree). Good enough for v1.
    const seenExp = new Set<string>();
    const mergedExp = [
      ...(primaryP.experience ?? []),
      ...extras.flatMap((it) => it.parsed.experience ?? []),
    ].filter((e) => {
      const k = `${(e.company ?? "").toLowerCase()}|${(e.title ?? "").toLowerCase()}`;
      if (seenExp.has(k)) return false;
      seenExp.add(k);
      return true;
    });
    const seenEdu = new Set<string>();
    const mergedEdu = [
      ...(primaryP.education ?? []),
      ...extras.flatMap((it) => it.parsed.education ?? []),
    ].filter((e) => {
      const k = `${(e.school ?? "").toLowerCase()}|${(e.degree ?? "").toLowerCase()}`;
      if (seenEdu.has(k)) return false;
      seenEdu.add(k);
      return true;
    });

    const mergedProfile: ParsedProfile = {
      ...primaryP,
      ...overrides,
      skills: mergedSkills,
      languages: mergedLanguages,
      experience: mergedExp,
      education: mergedEdu,
    };

    return {
      full_name: overrides.full_name ?? primaryP.full_name ?? null,
      email: overrides.email ?? primaryP.email ?? null,
      phone: overrides.phone ?? primaryP.phone ?? null,
      linkedin_url: overrides.linkedin_url ?? primaryP.linkedin_url ?? null,
      parsed_profile: mergedProfile,
    };
  }

  for (const decision of input.decisions) {
    try {
      if (decision.kind === "create-new") {
        const item = itemById.get(decision.tempId);
        if (!item) {
          result.errors.push({ tempId: decision.tempId, error: "Item no encontrado" });
          continue;
        }
        const fullName =
          item.parsed.full_name?.trim() ||
          item.filename.replace(/\.pdf$/i, "");
        const { data: created, error: cErr } = await db
          .from("candidates")
          .insert({
            workspace_id: workspaceId,
            full_name: fullName,
            email: item.parsed.email ?? null,
            phone: item.parsed.phone ?? null,
            linkedin_url: item.parsed.linkedin_url ?? null,
            parsed_profile: item.parsed,
            default_source: appSource,
            created_by_team_member_id: createdByTeamMemberId,
          })
          .select("id")
          .single();
        if (cErr || !created) {
          orphanPaths.push(item.storagePath);
          result.errors.push({
            tempId: decision.tempId,
            error: cErr?.message.slice(0, 200) || t("errors.insertFailed"),
          });
          continue;
        }
        const candidateId = created.id as string;
        const finalPath = await moveStorageToFinal(item, candidateId);
        if (finalPath) {
          await db
            .from("candidates")
            .update({ resume_url: finalPath })
            .eq("id", candidateId);
        } else {
          orphanPaths.push(item.storagePath);
        }
        const appErr = await createApplication(candidateId);
        if (appErr) {
          result.errors.push({ tempId: decision.tempId, error: appErr });
          continue;
        }
        result.created += 1;
      } else if (decision.kind === "create-merged") {
        const allItems = decision.tempIds
          .map((id) => itemById.get(id))
          .filter((i): i is BulkParseItem => Boolean(i));
        const primary = allItems.find((i) => i.tempId === decision.primaryTempId);
        if (!primary) {
          result.errors.push({ error: "Item primario no encontrado" });
          continue;
        }
        const extras = allItems.filter((i) => i.tempId !== decision.primaryTempId);
        const patch = buildCandidatePatch(primary, extras, decision.fields);
        const fullName = patch.full_name ?? primary.filename.replace(/\.pdf$/i, "");
        const { data: created, error: cErr } = await db
          .from("candidates")
          .insert({
            workspace_id: workspaceId,
            full_name: fullName,
            email: patch.email,
            phone: patch.phone,
            linkedin_url: patch.linkedin_url,
            parsed_profile: patch.parsed_profile,
            default_source: appSource,
            created_by_team_member_id: createdByTeamMemberId,
          })
          .select("id")
          .single();
        if (cErr || !created) {
          allItems.forEach((i) => orphanPaths.push(i.storagePath));
          result.errors.push({
            error: cErr?.message.slice(0, 200) || t("errors.insertFailed"),
          });
          continue;
        }
        const candidateId = created.id as string;
        // Move primary's PDF, discard the rest.
        const finalPath = await moveStorageToFinal(primary, candidateId);
        if (finalPath) {
          await db
            .from("candidates")
            .update({ resume_url: finalPath })
            .eq("id", candidateId);
        }
        for (const extra of extras) {
          orphanPaths.push(extra.storagePath);
        }
        const appErr = await createApplication(candidateId);
        if (appErr) {
          result.errors.push({ error: appErr });
          continue;
        }
        result.created += 1;
      } else if (decision.kind === "update-existing") {
        const allItems = decision.tempIds
          .map((id) => itemById.get(id))
          .filter((i): i is BulkParseItem => Boolean(i));
        const primary = allItems.find((i) => i.tempId === decision.primaryTempId);
        if (!primary || allItems.length === 0) {
          result.errors.push({ error: "Item primario no encontrado" });
          continue;
        }
        const extras = allItems.filter((i) => i.tempId !== decision.primaryTempId);
        const patch = buildCandidatePatch(primary, extras, decision.fields);
        const { error: uErr } = await db
          .from("candidates")
          .update(patch)
          .eq("id", decision.candidateId);
        if (uErr) {
          allItems.forEach((i) => orphanPaths.push(i.storagePath));
          result.errors.push({
            error: uErr.message.slice(0, 200),
          });
          continue;
        }
        // Optionally store the primary PDF as the updated resume_url.
        const finalPath = await moveStorageToFinal(primary, decision.candidateId);
        if (finalPath) {
          await db
            .from("candidates")
            .update({ resume_url: finalPath })
            .eq("id", decision.candidateId);
        }
        for (const extra of extras) {
          orphanPaths.push(extra.storagePath);
        }
        const appErr = await createApplication(decision.candidateId);
        if (appErr) {
          result.errors.push({ error: appErr });
          continue;
        }
        result.updated += 1;
      } else if (decision.kind === "discard") {
        for (const id of decision.tempIds) {
          const it = itemById.get(id);
          if (it) orphanPaths.push(it.storagePath);
        }
      }
    } catch (e) {
      result.errors.push({
        error: e instanceof Error ? e.message.slice(0, 200) : "Unknown",
      });
    }
  }

  // Clean up any orphan _pending files (failed inserts, discarded, extras).
  if (orphanPaths.length > 0) {
    await supabase.storage.from(RESUME_BUCKET).remove(orphanPaths);
  }

  if (input.jobId) {
    revalidatePath(`/jobs/${input.jobId}`);
  } else {
    revalidatePath("/candidates");
  }
  return { ok: true, data: result };
}

/**
 * Bulk-delete candidates. Used by the selection toolbar on
 * /candidates. RLS scopes by workspace; we just feed the id list
 * to a single IN-delete. ON DELETE CASCADE on applications cleans
 * up the application rows so the data stays consistent.
 */
export async function bulkDeleteCandidatesAction(
  ids: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  if (!Array.isArray(ids) || ids.length === 0) {
    const t = await getT();
    return { ok: false, error: t("errors.noCandidatesToDelete") };
  }
  const db = await hiring();
  const { data, error } = await db
    .from("candidates")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/candidates");
  return { ok: true, data: { deleted: (data ?? []).length } };
}

/**
 * Server-action wrapper around `loadSources` so the client-side bulk
 * popover can fetch workspace sources on demand without preloading
 * them via props.
 */
export async function loadSourcesForScopeAction(
  scope: "candidate" | "company",
): Promise<
  ActionResult<Array<{ id: string; label: string; color: string | null }>>
> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { loadSources } = await import("@/lib/sources");
  const rows = await loadSources(scope);
  return {
    ok: true,
    data: rows.map((r) => ({ id: r.id, label: r.label, color: r.color })),
  };
}

/**
 * Bulk-set candidates.source_id for every selected candidate. Pass
 * `null` to clear. Same RLS scope as the inline candidate edit — RLS
 * filters foreign workspaces.
 */
export async function bulkUpdateCandidateSourceAction(
  candidateIds: string[],
  sourceId: string | null,
): Promise<ActionResult<{ updated: number }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return { ok: true, data: { updated: 0 } };
  }
  const db = await hiring();
  const { data, error } = await db
    .from("candidates")
    .update({ source_id: sourceId })
    .in("id", candidateIds)
    .select("id");
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/candidates");
  return { ok: true, data: { updated: (data ?? []).length } };
}

/**
 * Bulk-set companies.status (workspace status slug). Pass `null` to
 * clear. Skips the per-row before/after event row the single-version
 * writes — on a bulk change the event noise outweighs the audit
 * value.
 */
export async function bulkUpdateCompanyStatusForAllAction(
  companyIds: string[],
  status: string | null,
): Promise<ActionResult<{ updated: number }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return { ok: true, data: { updated: 0 } };
  }
  const db = await hiring();
  const { data, error } = await db
    .from("companies")
    .update({ status })
    .in("id", companyIds)
    .select("id");
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/companies");
  return { ok: true, data: { updated: (data ?? []).length } };
}

/**
 * Bulk-set contacts.owner_id (team_members.id). Pass `null` to clear.
 */
export async function bulkUpdateContactOwnerAction(
  contactIds: string[],
  ownerId: string | null,
): Promise<ActionResult<{ updated: number }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return { ok: true, data: { updated: 0 } };
  }
  const db = await hiring();
  const { data, error } = await db
    .from("contacts")
    .update({ owner_id: ownerId })
    .in("id", contactIds)
    .select("id");
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/contacts");
  return { ok: true, data: { updated: (data ?? []).length } };
}

/**
 * Bulk-delete companies. Same pattern as the other bulk deletes.
 * Companies referenced by other rows (jobs, deals, contacts) will
 * either fail the delete (FK with no cascade) or cascade depending
 * on each FK's policy — surface the raw error on conflict.
 */
export async function bulkDeleteCompaniesAction(
  ids: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  if (!Array.isArray(ids) || ids.length === 0) {
    const t = await getT();
    return { ok: false, error: t("errors.noCompaniesToDelete") };
  }
  const db = await hiring();
  const { data, error } = await db
    .from("companies")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/companies");
  return { ok: true, data: { deleted: (data ?? []).length } };
}

// ============================================================
// Add a talent-pool candidate to a job (from the profile screen)
// ============================================================

/**
 * Link an existing candidate to a job by creating an application in
 * that job's first pipeline stage. Idempotent-ish: if the candidate
 * already has an application on the job we surface a friendly error
 * rather than creating a duplicate. Any team member can do this
 * (recruiters add candidates to vacantes as their core workflow).
 */
export async function addCandidateToJobAction(input: {
  candidateId: string;
  jobId: string;
  stageId?: string | null;
}): Promise<ActionResult<{ applicationId: string }>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const t = await getT();
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Guard against duplicates — one application per (candidate, job).
  const { data: existing } = await db
    .from("applications")
    .select("id")
    .eq("candidate_id", input.candidateId)
    .eq("job_id", input.jobId)
    .maybeSingle();
  if (existing?.id) {
    return { ok: false, error: t("addToJob.alreadyLinked") };
  }

  const stageId = await resolveTargetStageId(
    db,
    workspaceId,
    input.jobId,
    input.stageId,
  );

  // Resolve the stage's category so kanban grouping + the profile's
  // status pill are correct immediately (not null until first move).
  let category: string | null = null;
  if (stageId) {
    const { data: st } = await db
      .from("pipeline_stages")
      .select("category")
      .eq("id", stageId)
      .maybeSingle();
    category = (st?.category as string | null) ?? null;
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("applications")
    .insert({
      workspace_id: workspaceId,
      candidate_id: input.candidateId,
      job_id: input.jobId,
      source: "direct" as CandidateSource,
      stage_id: stageId,
      category,
      applied_at: now,
      status_changed_at: now,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || t("addToJob.failed"),
    };
  }
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${input.candidateId}`);
  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true, data: { applicationId: data.id as string } };
}
