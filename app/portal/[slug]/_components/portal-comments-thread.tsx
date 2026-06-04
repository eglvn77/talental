import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { PortalCommentRow } from "@/lib/hiring";
import type { TFunction } from "@/lib/i18n/translate";

export function PortalCommentsThread({
  comments,
  t,
}: {
  comments: PortalCommentRow[];
  t: TFunction;
}) {
  if (comments.length === 0) {
    return (
      <p className="mt-2 rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-4 text-center text-xs text-muted-foreground">
        {t("portal.commentEmpty")}
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-2">
      {comments.map((c) => (
        <li
          key={c.id}
          className="rounded-md border border-border bg-bg-2 px-3 py-2"
        >
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {c.email_snapshot}
            </span>
            {c.sentiment === "up" ? (
              <ThumbsUp className="h-3 w-3 text-positive" aria-label="Like" />
            ) : c.sentiment === "down" ? (
              <ThumbsDown className="h-3 w-3 text-danger" aria-label="Dislike" />
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
