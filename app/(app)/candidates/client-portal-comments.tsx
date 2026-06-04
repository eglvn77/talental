import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import type { PortalCommentRow } from "@/lib/hiring";
import type { TFunction } from "@/lib/i18n/translate";

/**
 * Read-only feed of client-portal feedback (comments + 👍/👎) for one
 * candidate, aggregated across every application the client can see.
 * Recruiter-side view — clients post via the portal, this is where
 * Emanuel reads what they said.
 */
export function ClientPortalComments({
  comments,
  t,
}: {
  comments: Array<PortalCommentRow & { job_title: string | null }>;
  t: TFunction;
}) {
  if (comments.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-4 text-center text-xs text-muted-foreground">
        {t("candidatesArea.clientCommentsEmpty")}
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {comments.map((c) => (
        <li
          key={c.id}
          className="rounded-md border border-border bg-bg-2 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {c.email_snapshot}
            </span>
            {c.sentiment === "up" ? (
              <ThumbsUp
                className="h-3 w-3 text-positive"
                aria-label={t("portal.thumbsUp")}
              />
            ) : c.sentiment === "down" ? (
              <ThumbsDown
                className="h-3 w-3 text-danger"
                aria-label={t("portal.thumbsDown")}
              />
            ) : null}
            {c.job_title ? (
              <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px]">
                {c.job_title}
              </span>
            ) : null}
            <span className="ml-auto">
              {new Date(c.created_at).toLocaleString()}
            </span>
          </div>
          {c.body ? (
            <p className="mt-1 whitespace-pre-line text-sm text-foreground/90">
              {c.body}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ClientPortalCommentsHeader({
  count,
  t,
}: {
  count: number;
  t: TFunction;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
      <h3 className="text-sm font-semibold">
        {t("candidatesArea.clientCommentsTitle")}
      </h3>
      {count > 0 ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
          {count}
        </span>
      ) : null}
    </div>
  );
}
