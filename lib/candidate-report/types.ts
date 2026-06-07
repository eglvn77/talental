import "server-only";

/**
 * Structured candidate report — the shape Claude returns via the
 * populate_candidate_report tool, before we render it to markdown.
 *
 * Keep this in sync with the tool schema in `tool-schema.ts` and the
 * prompt template seeded in the candidate_report_master prompt.
 */

export type RatingValue = "strong_yes" | "yes" | "lean_yes" | "lean_no" | "no";

export type EvidencedPoint = {
  point: string;
  evidence: string;
};

export type CompensationInfo = {
  stated: boolean;
  range?: string | null;
  currency?: string | null;
  notes?: string | null;
};

export type CandidateReportStruct = {
  overall_rating: RatingValue;
  summary: string;
  strengths: EvidencedPoint[];
  concerns: EvidencedPoint[];
  to_probe: string[];
  compensation: CompensationInfo;
  recommendation: string;
  input_provenance: {
    transcripts_used: Array<{ id: string; title: string }>;
    cv_used: boolean;
    enrichment_used: boolean;
  };
};
