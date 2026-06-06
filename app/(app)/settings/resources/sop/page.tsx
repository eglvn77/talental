import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy redirect — the SOP editor moved to /settings/sop as part of
 * the Jobs settings reorg (SOP is its own top-level tab now). Kept
 * for bookmarks; safe to drop after a soak.
 */
export default function SopEditorRedirect() {
  redirect("/settings/sop");
}
