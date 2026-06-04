"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { portalPostCommentAction } from "../actions";

type Sentiment = "up" | "down" | null;

export function PortalCommentForm({
  slug,
  applicationId,
}: {
  slug: string;
  applicationId: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [sentiment, setSentiment] = useState<Sentiment>(null);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!body.trim() && !sentiment) return;
    startTransition(async () => {
      const res = await portalPostCommentAction({
        slug,
        applicationId,
        body: body.trim() || undefined,
        sentiment,
      });
      if (!res.ok) {
        toast.actionFailed(t("portal.commentSubmit"), res.error);
        return;
      }
      setBody("");
      setSentiment(null);
      router.refresh();
    });
  }

  function fireThumbs(next: Sentiment) {
    const newSentiment = sentiment === next ? null : next;
    setSentiment(newSentiment);
    if (!body.trim() && newSentiment) {
      // Stand-alone reaction — submit immediately.
      startTransition(async () => {
        const res = await portalPostCommentAction({
          slug,
          applicationId,
          sentiment: newSentiment,
        });
        if (!res.ok) {
          toast.actionFailed(t("portal.commentSubmit"), res.error);
          setSentiment(null);
          return;
        }
        setSentiment(null);
        router.refresh();
      });
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 rounded-md border border-border bg-bg-2 p-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder={t("portal.commentPlaceholder")}
        className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fireThumbs("up")}
          disabled={pending}
          aria-label={t("portal.thumbsUp")}
          title={t("portal.thumbsUp")}
          className={cn(
            "rounded-md border border-border p-1.5 transition-colors",
            sentiment === "up"
              ? "border-positive bg-positive/15 text-positive"
              : "text-muted-foreground hover:bg-positive/10 hover:text-positive",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => fireThumbs("down")}
          disabled={pending}
          aria-label={t("portal.thumbsDown")}
          title={t("portal.thumbsDown")}
          className={cn(
            "rounded-md border border-border p-1.5 transition-colors",
            sentiment === "down"
              ? "border-danger bg-danger/15 text-danger"
              : "text-muted-foreground hover:bg-danger/10 hover:text-danger",
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
        <Button
          type="submit"
          disabled={pending || (!body.trim() && !sentiment)}
          className="ml-auto gap-1.5"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {t("portal.commentSubmit")}
        </Button>
      </div>
    </form>
  );
}
