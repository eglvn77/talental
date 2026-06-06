/**
 * Plain types + constants for the feedback timeline. Lives outside
 * the "use server" file because that boundary only allows async
 * function exports — any non-function export (consts, arrays,
 * objects, classes) tips Next.js into a build-time error
 * ("A 'use server' file can only export async functions, found
 * object").
 *
 * Both the editor (client) and the action (server) import from here.
 */

export type FeedbackSource =
  | "manual"
  | "slack"
  | "whatsapp"
  | "call"
  | "email"
  | "other";

export const FEEDBACK_SOURCES: FeedbackSource[] = [
  "manual",
  "call",
  "slack",
  "whatsapp",
  "email",
  "other",
];

export type FeedbackEntry = {
  id: string;
  job_id: string;
  body: string;
  source: FeedbackSource;
  received_at: string;
  recorded_by_team_member_id: string | null;
  created_at: string;
};
