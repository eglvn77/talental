/**
 * Runtime feature flags. Plain boolean constants for now — when we need
 * per-workspace flags later, swap to a function reading from `workspaces`
 * or a flag service.
 */
export const FEATURE_FLAGS = {
  jobSequencesTab: false, // TODO: re-enable when sequences module ships
  jobReportsTab: false, // TODO: re-enable when reports module ships
} as const;
