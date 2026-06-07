import "server-only";

import type {
  CandidateReportStruct,
  RatingValue,
} from "./types";

/**
 * Render the structured report to markdown. The recruiter edits this
 * markdown directly in the UI; saving sets report_edited_at so we
 * know not to silently overwrite manual edits on re-generate.
 *
 * Style notes:
 * - Bottom line first (rating + recommendation).
 * - Strengths/concerns as bullet lists with evidence in parens.
 * - Compensation only shown when stated=true.
 * - No "provenance" footer in the markdown itself; that lives in
 *   applications.report_inputs and is surfaced separately in the UI.
 */

const RATING_LABELS_ES: Record<RatingValue, string> = {
  strong_yes: "Strong yes",
  yes: "Yes",
  lean_yes: "Lean yes",
  lean_no: "Lean no",
  no: "No",
};

export function renderReportMarkdown(s: CandidateReportStruct): string {
  const lines: string[] = [];

  lines.push(`## Rating: ${RATING_LABELS_ES[s.overall_rating]}`);
  lines.push("");
  lines.push(s.summary.trim());
  lines.push("");

  if (s.strengths.length > 0) {
    lines.push("### Fortalezas");
    for (const f of s.strengths) {
      lines.push(`- **${f.point}** — ${f.evidence}`);
    }
    lines.push("");
  }

  if (s.concerns.length > 0) {
    lines.push("### Concerns");
    for (const c of s.concerns) {
      lines.push(`- **${c.point}** — ${c.evidence}`);
    }
    lines.push("");
  }

  if (s.to_probe.length > 0) {
    lines.push("### A indagar");
    for (const q of s.to_probe) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }

  if (s.compensation.stated) {
    lines.push("### Compensación");
    const compParts: string[] = [];
    if (s.compensation.range) {
      compParts.push(
        `${s.compensation.range}${s.compensation.currency ? ` ${s.compensation.currency}` : ""}`,
      );
    }
    if (s.compensation.notes) compParts.push(s.compensation.notes);
    lines.push(compParts.join(" · ") || "(stated, no specifics)");
    lines.push("");
  }

  if (s.recommendation?.trim()) {
    lines.push("### Recomendación");
    lines.push(s.recommendation.trim());
    lines.push("");
  }

  return lines.join("\n").trim();
}
