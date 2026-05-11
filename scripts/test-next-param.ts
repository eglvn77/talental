/**
 * Validates the sanitizeNext() open-redirect guard used by
 * passwordSignInAction and sendMagicLinkAction.
 *
 * Usage:
 *   npx --yes tsx scripts/test-next-param.ts
 */
import { sanitizeNext, DEFAULT_NEXT } from "../app/login/sanitize-next";

let pass = 0;
let fail = 0;

function check(name: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log(`[PASS] ${name} → "${actual}"`);
    pass++;
  } else {
    console.log(`[FAIL] ${name} → got "${actual}", expected "${expected}"`);
    fail++;
  }
}

// Valid relative paths — preserved as-is.
check("valid /jobs", sanitizeNext("/jobs"), "/jobs");
check("valid /companies", sanitizeNext("/companies"), "/companies");
check("valid /jobs/abc-123", sanitizeNext("/jobs/abc-123"), "/jobs/abc-123");
check("valid path + query", sanitizeNext("/jobs?foo=bar"), "/jobs?foo=bar");
check("valid path + hash", sanitizeNext("/jobs#anchor"), "/jobs#anchor");
check("valid root path", sanitizeNext("/"), "/");

// Open-redirect attempts — must fall back to DEFAULT_NEXT.
check("absolute https URL rejected", sanitizeNext("https://evil.com"), DEFAULT_NEXT);
check("absolute http URL rejected", sanitizeNext("http://evil.com/path"), DEFAULT_NEXT);
check("protocol-relative // rejected", sanitizeNext("//evil.com"), DEFAULT_NEXT);
check("protocol-relative //evil/path rejected", sanitizeNext("//evil.com/jobs"), DEFAULT_NEXT);
check("javascript: scheme rejected", sanitizeNext("javascript:alert(1)"), DEFAULT_NEXT);
check("data: scheme rejected", sanitizeNext("data:text/html,<script>"), DEFAULT_NEXT);
check("no leading slash rejected", sanitizeNext("jobs"), DEFAULT_NEXT);
check("hash-only rejected", sanitizeNext("#foo"), DEFAULT_NEXT);

// Empty / missing — fall back.
check("null → default", sanitizeNext(null), DEFAULT_NEXT);
check("undefined → default", sanitizeNext(undefined), DEFAULT_NEXT);
check("empty string → default", sanitizeNext(""), DEFAULT_NEXT);

// Control characters — fall back (defense in depth).
check("newline injection rejected", sanitizeNext("/jobs\nLocation: https://evil.com"), DEFAULT_NEXT);
check("CR injection rejected", sanitizeNext("/jobs\r\nfoo"), DEFAULT_NEXT);
check("tab rejected", sanitizeNext("/jobs\tfoo"), DEFAULT_NEXT);
check("null byte rejected", sanitizeNext("/jobs\x00"), DEFAULT_NEXT);

// Defense in depth: embedded "://" anywhere.
check("path with embedded ://", sanitizeNext("/foo://bar"), DEFAULT_NEXT);

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
