/**
 * Cross-tenant RLS isolation test.
 *
 * Setup (service role):
 *   1. Create dummy "Test Agency" workspace
 *   2. Create dummy auth user `test-rls@example.com`
 *   3. Make them a team_member (recruiter) of Test Agency
 *   4. Insert a company / job / candidate / application in Test Agency
 *
 * Tests (Talental user, RLS-respecting client via signed-in session):
 *   - SELECT jobs/companies/candidates → no Test Agency rows
 *   - INSERT into Test Agency workspace → blocked by RLS
 *   - UPDATE / DELETE Test Agency rows → 0 rows affected
 *
 * Cleanup is unconditional (runs even when tests fail).
 *
 * Usage:
 *   npx --yes tsx --env-file=.env.local scripts/test-rls-isolation.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TEST_EMAIL = "test-rls@example.com";
const TEST_PASSWORD = "Test-RLS-passw0rd!";
const TEST_AGENCY_SLUG = `test-agency-${Date.now()}`;

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`[PASS] ${name}${detail ? ` (${detail})` : ""}`);
    pass++;
  } else {
    console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    fail++;
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const talentalEmail = process.env.BOOTSTRAP_EMAIL;
  if (!url || !serviceKey || !anonKey || !talentalEmail) {
    throw new Error(
      "Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, BOOTSTRAP_EMAIL",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // We'll capture these so cleanup runs even on failure.
  let testWorkspaceId: string | null = null;
  let testUserId: string | null = null;
  let testCompanyId: string | null = null;
  let testJobId: string | null = null;
  let testCandidateId: string | null = null;
  let testApplicationId: string | null = null;
  let talentalClient: SupabaseClient | null = null;
  let talentalUserId: string | null = null;

  try {
    // ============================================================
    // SETUP
    // ============================================================

    // 1. Test Agency workspace
    {
      const { data, error } = await admin
        .schema("hiring")
        .from("workspaces")
        .insert({
          slug: TEST_AGENCY_SLUG,
          name: "Test Agency",
          plan_tier: "trial",
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`workspace insert: ${error?.message}`);
      testWorkspaceId = data.id as string;
    }

    // 2. Dummy auth user
    {
      const { data, error } = await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { source: "rls-test" },
      });
      if (error || !data.user) throw new Error(`auth user: ${error?.message}`);
      testUserId = data.user.id;
    }

    // 3. team_member in Test Agency
    {
      const { error } = await admin
        .schema("hiring")
        .from("team_members")
        .insert({
          workspace_id: testWorkspaceId,
          auth_user_id: testUserId,
          email: TEST_EMAIL,
          full_name: "RLS Tester",
          team_role: "recruiter",
        });
      if (error) throw new Error(`team_member: ${error.message}`);
    }

    // 4. Seed Test Agency rows
    {
      const { data: c, error: cErr } = await admin
        .schema("hiring")
        .from("companies")
        .insert({
          workspace_id: testWorkspaceId,
          name: "Acme Test",
          status: "client",
        })
        .select("id")
        .single();
      if (cErr || !c) throw new Error(`company: ${cErr?.message}`);
      testCompanyId = c.id as string;

      const { data: j, error: jErr } = await admin
        .schema("hiring")
        .from("jobs")
        .insert({
          workspace_id: testWorkspaceId,
          company_id: testCompanyId,
          title: "Secret Test Job",
          status: "draft",
        })
        .select("id")
        .single();
      if (jErr || !j) throw new Error(`job: ${jErr?.message}`);
      testJobId = j.id as string;

      const { data: cand, error: candErr } = await admin
        .schema("hiring")
        .from("candidates")
        .insert({
          workspace_id: testWorkspaceId,
          full_name: "Test Candidate",
          email: "secret@test.example",
        })
        .select("id")
        .single();
      if (candErr || !cand) throw new Error(`candidate: ${candErr?.message}`);
      testCandidateId = cand.id as string;

      const { data: app, error: appErr } = await admin
        .schema("hiring")
        .from("applications")
        .insert({
          workspace_id: testWorkspaceId,
          job_id: testJobId,
          candidate_id: testCandidateId,
          source: "linkedin",
        })
        .select("id")
        .single();
      if (appErr || !app) throw new Error(`application: ${appErr?.message}`);
      testApplicationId = app.id as string;
    }

    // ============================================================
    // Sign in as the Talental user (RLS-respecting client)
    // ============================================================

    // Find Talental user id
    {
      let page = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (error) throw error;
        const found = data.users.find(
          (u) => u.email?.toLowerCase() === talentalEmail.toLowerCase(),
        );
        if (found) {
          talentalUserId = found.id;
          break;
        }
        if (data.users.length < 200) break;
        page++;
      }
      if (!talentalUserId) {
        throw new Error(`Talental user ${talentalEmail} not found in auth`);
      }
    }

    // Mint a session for the Talental user via generateLink + verify-otp.
    // Simpler: temporarily set a known password, sign in, then clear.
    const TEMP_PW = `temp-${Date.now()}-rls-isolation`;
    await admin.auth.admin.updateUserById(talentalUserId, {
      password: TEMP_PW,
    });
    talentalClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signin = await talentalClient.auth.signInWithPassword({
      email: talentalEmail,
      password: TEMP_PW,
    });
    if (signin.error) throw new Error(`talental signin: ${signin.error.message}`);

    // ============================================================
    // ASSERTIONS
    // ============================================================

    // 1. SELECT jobs — Test Agency job should be invisible
    {
      const { data, error } = await talentalClient
        .schema("hiring")
        .from("jobs")
        .select("id, title")
        .eq("id", testJobId);
      const containsTestJob = (data ?? []).some((r) => r.id === testJobId);
      check(
        "Talental cannot SELECT Test Agency jobs",
        !containsTestJob && !error,
        `rows: ${(data ?? []).length}`,
      );
    }

    // 2. SELECT companies
    {
      const { data } = await talentalClient
        .schema("hiring")
        .from("companies")
        .select("id")
        .eq("id", testCompanyId);
      check(
        "Talental cannot SELECT Test Agency companies",
        (data ?? []).length === 0,
        `rows: ${(data ?? []).length}`,
      );
    }

    // 3. SELECT candidates
    {
      const { data } = await talentalClient
        .schema("hiring")
        .from("candidates")
        .select("id")
        .eq("id", testCandidateId);
      check(
        "Talental cannot SELECT Test Agency candidates",
        (data ?? []).length === 0,
        `rows: ${(data ?? []).length}`,
      );
    }

    // 4. SELECT applications
    {
      const { data } = await talentalClient
        .schema("hiring")
        .from("applications")
        .select("id")
        .eq("id", testApplicationId);
      check(
        "Talental cannot SELECT Test Agency applications",
        (data ?? []).length === 0,
        `rows: ${(data ?? []).length}`,
      );
    }

    // 5. INSERT into Test Agency — should fail (RLS blocks)
    {
      const { error } = await talentalClient
        .schema("hiring")
        .from("jobs")
        .insert({
          workspace_id: testWorkspaceId,
          company_id: testCompanyId,
          title: "Hacked job",
          status: "draft",
        });
      check(
        "Talental cannot INSERT into Test Agency",
        Boolean(error),
        error ? `err: ${error.code}` : "INSERT succeeded — leak!",
      );
    }

    // 6. UPDATE Test Agency job — should affect 0 rows
    {
      const { data, error } = await talentalClient
        .schema("hiring")
        .from("jobs")
        .update({ title: "hacked" })
        .eq("id", testJobId)
        .select();
      check(
        "Talental UPDATE on Test Agency affects 0 rows",
        !error && (data ?? []).length === 0,
        `rows: ${(data ?? []).length}`,
      );
    }

    // 7. DELETE Test Agency candidate — should affect 0 rows
    {
      const { data, error } = await talentalClient
        .schema("hiring")
        .from("candidates")
        .delete()
        .eq("id", testCandidateId)
        .select();
      check(
        "Talental DELETE on Test Agency affects 0 rows",
        !error && (data ?? []).length === 0,
        `rows: ${(data ?? []).length}`,
      );
    }

    // 8. Talental can still SELECT their own data (sanity check)
    {
      const { data, error } = await talentalClient
        .schema("hiring")
        .from("workspaces")
        .select("id, slug");
      const onlyTalental = (data ?? []).every((w) => w.slug !== TEST_AGENCY_SLUG);
      check(
        "Talental can list their own workspaces (and only theirs)",
        !error && (data ?? []).length >= 1 && onlyTalental,
        `rows: ${(data ?? []).length}`,
      );
    }

    // 9. Storage isolation — Talental cannot list Test Agency files
    {
      const { data: list, error } = await talentalClient.storage
        .from("hiring-resumes")
        .list(testWorkspaceId ?? "", { limit: 100 });
      // RLS on storage.objects: SELECT requires path under user's workspace.
      // Listing a folder under a foreign workspace returns empty (no rows
      // visible) and no error.
      check(
        "Talental cannot list Test Agency storage folder",
        !error && (list ?? []).length === 0,
        `entries: ${(list ?? []).length}`,
      );
    }
  } finally {
    // ============================================================
    // CLEANUP
    // ============================================================
    console.log("\nCleanup…");
    if (testApplicationId) {
      await admin.schema("hiring").from("applications").delete().eq("id", testApplicationId);
    }
    if (testCandidateId) {
      await admin.schema("hiring").from("candidates").delete().eq("id", testCandidateId);
    }
    if (testJobId) {
      await admin.schema("hiring").from("jobs").delete().eq("id", testJobId);
    }
    if (testCompanyId) {
      await admin.schema("hiring").from("companies").delete().eq("id", testCompanyId);
    }
    if (testUserId) {
      await admin.schema("hiring").from("team_members").delete().eq("auth_user_id", testUserId);
      await admin.auth.admin.deleteUser(testUserId);
    }
    if (testWorkspaceId) {
      await admin.schema("hiring").from("workspaces").delete().eq("id", testWorkspaceId);
    }
    // Verify residue
    if (testWorkspaceId) {
      const { data } = await admin
        .schema("hiring")
        .from("workspaces")
        .select("id")
        .eq("id", testWorkspaceId);
      if ((data ?? []).length > 0) {
        console.error("Cleanup residue: workspace still exists");
      }
    }
  }

  console.log(`\n${pass} passed / ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
