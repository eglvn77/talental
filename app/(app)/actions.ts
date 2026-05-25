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
  type JobStatus,
} from "@/lib/hiring";
import { canActivateJob } from "@/lib/job-status";
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

  if (templateId) {
    // Pull the template's stages (RLS scopes to the workspace so a
    // cross-tenant id can't sneak through).
    const { data: tplStages } = await db
      .from("process_template_stages")
      .select("name, category, color, position, client_portal_visible")
      .eq("template_id", templateId)
      .order("position", { ascending: true });
    if (tplStages && tplStages.length > 0) {
      await db.from("pipeline_stages").insert(
        tplStages.map((s) => ({
          workspace_id: workspaceId,
          job_id: jobId,
          name: s.name as string,
          category: s.category,
          color: s.color as string,
          position: s.position as number,
          client_portal_visible:
            (s.client_portal_visible as boolean | null) ?? false,
        })),
      );
      return tplStages.length;
    }
  }

  // Fallback: hard-coded defaults. Should only fire when a workspace
  // has no templates yet (pre-migration installs, etc.).
  await db.from("pipeline_stages").insert(
    DEFAULT_PIPELINE_STAGES.map((s, i) => ({
      workspace_id: workspaceId,
      job_id: jobId,
      name: s.name,
      category: s.category,
      color: s.color,
      position: (i + 1) * 10,
      client_portal_visible: s.client_portal_visible ?? false,
    })),
  );
  return DEFAULT_PIPELINE_STAGES.length;
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
  roleType?: string | null;
  /**
   * Process template whose stages get copied into the new vacante's
   * pipeline. Optional — omitted falls back to the workspace's
   * default template (or the hard-coded DEFAULT_PIPELINE_STAGES if
   * the workspace somehow has none yet).
   */
  processTemplateId?: string | null;
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
  if (!title) {
    return { ok: false, error: "Title is required" };
  }

  // role_type is optional at create — it's decided during the Kickoff
  // dialog and persisted there. Leaving it null at create lets the
  // recruiter open the vacante before knowing the engagement model.
  const ROLE_TYPES = ["full_headhunting", "hybrid_ai_hunting", "inbound_ai_driven"];
  const roleType = ROLE_TYPES.includes(input.roleType ?? "")
    ? (input.roleType as
        | "full_headhunting"
        | "hybrid_ai_hunting"
        | "inbound_ai_driven")
    : null;

  // If a location was typed, it must come from the Google Maps autocomplete
  // (i.e. carry a place_id). Reject free-text locations.
  const locationText = input.location?.trim();
  if (locationText && !input.locationPlaceId) {
    return {
      ok: false,
      error: "Selecciona una ubicación de la lista de Google Maps",
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
      role_type: roleType,
      status: "borrador" satisfies JobStatus,
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

  // Resolve which template's stages to seed. Explicit param wins;
  // otherwise pull the workspace's default template; otherwise fall
  // back to DEFAULT_PIPELINE_STAGES.
  let templateId: string | null = input.processTemplateId ?? null;
  if (!templateId) {
    const { data: def } = await db
      .from("process_templates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_default", true)
      .maybeSingle();
    templateId = (def?.id as string | undefined) ?? null;
  }
  await seedStagesForJob(job.id as string, workspaceId, templateId);

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
  roleType?: string | null;
  openDate?: string | null;
  targetStartDate?: string | null;
  hiringManagerName?: string | null;
  contractType?: string | null;
  workingHours?: string | null;
  languageRequirements?: string | null;
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
  companyId?: string | null;
  feeTerms?: FeeTermsInput;
  /**
   * Internal recruiter assignment. Only admins can change this;
   * the field is set to null to unassign. The current value is
   * preserved if the key is omitted.
   */
  recruiterTeamMemberId?: string | null;
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
    roleType?: string | null;
    assessmentLink?: string | null;
  };
  // ----- Publicación tab knobs -----
  postingLanguage?: "es" | "en";
  showSalaryInPosting?: boolean;
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
  if (input.roleType !== undefined) {
    const ROLE_TYPES = [
      "full_headhunting",
      "hybrid_ai_hunting",
      "inbound_ai_driven",
    ];
    patch.role_type = ROLE_TYPES.includes(input.roleType ?? "")
      ? input.roleType
      : null;
  }
  if (input.openDate !== undefined) patch.open_date = input.openDate || null;
  if (input.targetStartDate !== undefined)
    patch.target_start_date = input.targetStartDate || null;
  if (input.hiringManagerName !== undefined)
    patch.hiring_manager_name = input.hiringManagerName?.trim() || null;
  if (input.contractType !== undefined)
    patch.contract_type = input.contractType?.trim() || null;
  if (input.workingHours !== undefined)
    patch.working_hours = input.workingHours?.trim() || null;
  if (input.languageRequirements !== undefined)
    patch.language_requirements = input.languageRequirements?.trim() || null;
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
  if (input.roleConfig !== undefined) {
    const rc = input.roleConfig;
    const ROLE_TYPES = [
      "full_headhunting",
      "hybrid_ai_hunting",
      "inbound_ai_driven",
    ] as const;
    if (rc.roleType !== undefined) {
      patch.role_type = ROLE_TYPES.includes(
        rc.roleType as (typeof ROLE_TYPES)[number],
      )
        ? rc.roleType
        : null;
    }
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

  // Publicación block. All optional, all idempotent — checked
  // individually so toggling one knob doesn't reset the others.
  if (input.postingLanguage !== undefined) {
    patch.posting_language =
      input.postingLanguage === "en" ? "en" : "es";
  }
  if (typeof input.showSalaryInPosting === "boolean")
    patch.show_salary_in_posting = input.showSalaryInPosting;
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

// Sequence-step + Cmd+K global search live in dedicated _actions/ modules:
//   - updateSequenceStepAction → ./_actions/sequences
//   - globalSearchAction + GlobalSearchHit → ./_actions/search
// "use server" files cannot re-export from other modules (only async
// function declarations are allowed), so import them directly.

export async function updateJobStatusAction(
  jobId: string,
  newStatus: JobStatus,
): Promise<ActionResult> {
  // Admin-only: status transitions (activar / pausar / cubierta /
  // archivar) are a commercial decision, not a recruiter action.
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();

  // Activation gate: must have kickoff content OR the minimum manual fields.
  if (newStatus === "activa") {
    const { data: job } = await db
      .from("jobs")
      .select("overview, role_type, public_description")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return { ok: false, error: "Vacante no encontrada" };
    const check = canActivateJob(
      job as Pick<JobRow, "overview" | "role_type" | "public_description">,
    );
    if (!check.ok) return { ok: false, error: check.reason };
  }

  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === "activa") {
    patch.published_at = new Date().toISOString();
    // Seed open_date if the recruiter hasn't set it manually. Use the
    // existing select above for the activation gate to know the value
    // — fetch fresh to avoid stale reads.
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
  if (newStatus === "cubierta" || newStatus === "cancelada") {
    patch.closed_at = new Date().toISOString();
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
  const linkedin = input.linkedinUrl?.trim();
  if (email) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("email", email)
      .maybeSingle();
    candidateId = (data?.id as string | undefined) ?? undefined;
  }
  if (!candidateId && linkedin) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_url", linkedin)
      .maybeSingle();
    candidateId = (data?.id as string | undefined) ?? undefined;
  }
  if (!candidateId) {
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
        linkedin_url: linkedin || null,
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

  // Place into the role's first stage (lowest position) — typically "Sourced".
  const { data: firstStage } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("job_id", input.jobId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: app, error: appErr } = await db
    .from("applications")
    .insert({
      workspace_id: workspaceId,
      candidate_id: candidateId,
      job_id: input.jobId,
      source: input.source,
      stage_id: (firstStage?.id as string | undefined) ?? null,
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

export async function moveApplicationToStageAction(
  applicationId: string,
  stageId: string,
): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();

  const { data: stage, error: stageErr } = await db
    .from("pipeline_stages")
    .select("id, job_id")
    .eq("id", stageId)
    .maybeSingle();
  if (stageErr || !stage) {
    return { ok: false, error: "Stage not found" };
  }

  // Stage move also invalidates the cached AI context — the old status
  // line and next steps were computed against the previous stage, so
  // they're stale by definition. Clearing avoids surfacing wrong
  // suggestions; the slideover will prompt the user to regenerate next
  // time they open it. We don't auto-regenerate here to keep the move
  // fast (Claude call is 3-8s) and to not surprise the user with
  // background API costs.
  const { error: updErr } = await db
    .from("applications")
    .update({
      stage_id: stageId,
      ai_status_line: null,
      ai_next_steps: null,
      ai_context_updated_at: null,
    })
    .eq("id", applicationId)
    .eq("job_id", stage.job_id as string);
  if (updErr) return { ok: false, error: updErr.message.slice(0, 300) };

  revalidatePath(`/jobs/${stage.job_id as string}`);
  return { ok: true };
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

  const { data, error } = await db
    .from("companies")
    .insert({
      workspace_id: workspaceId,
      name,
      domain,
      website_url: websiteCanonical,
      linkedin_url: input.linkedinUrl?.trim() || null,
      logo_url: logoUrl,
      status: input.status ?? "prospect",
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "Failed to create company",
    };
  }

  revalidatePath("/companies");
  return { ok: true, data: { companyId: data.id as string } };
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
  const { error } = await (await hiring())
    .from("companies")
    .update({ status })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
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
      error: `Máximo ${BULK_MAX_FILES} archivos por batch.`,
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
      failed.push({ filename: file.name, reason: "Archivo vacío" });
      continue;
    }
    if (file.size > BULK_MAX_FILE_BYTES) {
      failed.push({
        filename: file.name,
        reason: `Excede ${Math.round(BULK_MAX_FILE_BYTES / 1024 / 1024)} MB`,
      });
      continue;
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      failed.push({ filename: file.name, reason: "Solo se aceptan PDFs" });
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
        reason: e instanceof Error ? e.message.slice(0, 200) : "PDF inválido",
      });
      continue;
    }
    if (!text.trim()) {
      await supabase.storage.from(RESUME_BUCKET).remove([storagePath]);
      failed.push({
        filename: file.name,
        reason: "Sin texto extraíble (¿PDF escaneado?)",
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
            : "Claude no pudo parsear",
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
}): Promise<ActionResult<BulkCommitResult>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  // Stamp the bulk-imported candidates with the team member who
  // ran the import so recruiters can still see talent-pool imports
  // they did themselves (Q1 option C).
  const createdByTeamMemberId = guard.data.id;

  const workspaceId = await getRequestWorkspaceId();
  const supabase = await createSupabaseServerClient();
  const db = supabase.schema("hiring");

  // Job mode: look up the first stage so new applications land
  // there. Talent-pool mode skips this entirely.
  let firstStageId: string | null = null;
  if (input.jobId) {
    const { data: firstStage } = await db
      .from("pipeline_stages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("job_id", input.jobId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    firstStageId = (firstStage?.id as string | undefined) ?? null;
  }

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
      source: "bulk_import" as CandidateSource,
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
            default_source: "bulk_import" as CandidateSource,
            created_by_team_member_id: createdByTeamMemberId,
          })
          .select("id")
          .single();
        if (cErr || !created) {
          orphanPaths.push(item.storagePath);
          result.errors.push({
            tempId: decision.tempId,
            error: cErr?.message.slice(0, 200) || "Insert falló",
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
            default_source: "bulk_import" as CandidateSource,
            created_by_team_member_id: createdByTeamMemberId,
          })
          .select("id")
          .single();
        if (cErr || !created) {
          allItems.forEach((i) => orphanPaths.push(i.storagePath));
          result.errors.push({
            error: cErr?.message.slice(0, 200) || "Insert falló",
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
    return { ok: false, error: "Sin candidatos para eliminar" };
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
    return { ok: false, error: "Sin empresas para eliminar" };
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
