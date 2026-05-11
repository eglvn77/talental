/**
 * Password reset flow smoke test.
 *
 * Steps:
 *   1. Create a confirmed dummy user with a known password
 *   2. Verify they can sign in with the original password
 *   3. Trigger resetPasswordForEmail (verifies the API call succeeds)
 *   4. Simulate the reset by calling admin.updateUserById with a new password
 *   5. Verify the new password works and the old one does NOT
 *   6. Cleanup
 *
 * Usage:
 *   npx --yes tsx --env-file=.env.local scripts/test-password-reset.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TS = Date.now();
const TEST_EMAIL = `test-reset-${TS}@example.com`;
const OLD_PASSWORD = "Old-pass-w0rd!";
const NEW_PASSWORD = "New-pass-w0rd!";

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
  if (!url || !serviceKey || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const admin: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let authUserId: string | null = null;

  try {
    // 1. Create confirmed user.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: OLD_PASSWORD,
      email_confirm: true,
      user_metadata: { source: "test-reset" },
    });
    if (createErr || !created.user) {
      throw new Error(`createUser failed: ${createErr?.message}`);
    }
    authUserId = created.user.id;
    console.log(`Setup complete. user=${authUserId}\n`);

    // 2. Sign in with old password.
    const { data: oldSignIn, error: oldErr } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: OLD_PASSWORD,
    });
    check(
      "Sign in with old password succeeds",
      Boolean(oldSignIn?.session) && !oldErr,
      `err=${oldErr?.message ?? "(none)"}`,
    );

    // 3. Trigger resetPasswordForEmail — verifies the API accepts the call.
    // (We don't actually click the link; that requires email delivery.)
    const { error: resetErr } = await anon.auth.resetPasswordForEmail(
      TEST_EMAIL,
      { redirectTo: "https://app.talental.mx/reset-password" },
    );
    // Rate-limit responses prove the API path is engaged; accept either.
    const resetOk =
      !resetErr || /rate.?limit/i.test(resetErr.message);
    check(
      "resetPasswordForEmail call accepted (or rate-limited)",
      resetOk,
      `err=${resetErr?.message ?? "(none)"}`,
    );

    // 4. Simulate the result of the reset: update the password via admin API.
    const { error: updateErr } = await admin.auth.admin.updateUserById(
      authUserId,
      { password: NEW_PASSWORD },
    );
    check(
      "admin.updateUserById changes password",
      !updateErr,
      `err=${updateErr?.message ?? "(none)"}`,
    );

    // 5. Verify new password works and old does not.
    await anon.auth.signOut();
    const { data: newSignIn, error: newErr } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: NEW_PASSWORD,
    });
    check(
      "Sign in with NEW password succeeds",
      Boolean(newSignIn?.session) && !newErr,
      `err=${newErr?.message ?? "(none)"}`,
    );

    await anon.auth.signOut();
    const { error: rejectOldErr } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: OLD_PASSWORD,
    });
    check(
      "Sign in with OLD password is rejected after reset",
      Boolean(rejectOldErr),
      `err=${rejectOldErr?.message ?? "(none)"}`,
    );
  } catch (e) {
    console.error("Test setup or assertion threw:", e);
    fail++;
  } finally {
    console.log("\nCleanup…");
    if (authUserId) {
      const { error } = await admin.auth.admin.deleteUser(authUserId);
      if (error) console.warn("  auth user delete:", error.message);
      else console.log("  auth user deleted");
    }
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
