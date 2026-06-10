"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "@/lib/toast";
import { setApplicationRatingAction } from "@/app/(app)/_actions/candidate-report";

/**
 * Compact editable 1-5 star rating for an application. The rating is
 * its own column (applications.rating) — seeded by the AI report
 * generator, freely editable here. Clicking the current value clears
 * it (back to unrated).
 *
 * Optimistic: paints immediately, rolls back on server failure.
 */
export function StarRating({
  applicationId,
  initialRating,
  size = 3.5,
}: {
  applicationId: string;
  initialRating: number | null;
  /** Star icon size in tailwind units (3.5 → h-3.5 w-3.5). */
  size?: 3 | 3.5 | 4;
}) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [hover, setHover] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const sizeCls =
    size === 3 ? "h-3 w-3" : size === 4 ? "h-4 w-4" : "h-3.5 w-3.5";

  function commit(next: number | null) {
    const prev = rating;
    setRating(next);
    startTransition(async () => {
      const res = await setApplicationRatingAction({
        applicationId,
        rating: next,
      });
      if (!res.ok) {
        setRating(prev);
        toast.actionFailed("No se pudo guardar el rating", res.error);
      }
    });
  }

  const display = hover ?? rating ?? 0;

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHover(null)}
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={rating === n}
          aria-label={`${n}/5`}
          title={rating === n ? "Quitar rating" : `${n}/5`}
          onMouseEnter={() => setHover(n)}
          onClick={(e) => {
            // Inside clickable rows — don't trigger row expansion.
            e.stopPropagation();
            commit(rating === n ? null : n);
          }}
          className="rounded-sm p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={
              sizeCls +
              " " +
              (n <= display
                ? "fill-amber-400 text-amber-400"
                : "text-foreground/20")
            }
          />
        </button>
      ))}
    </div>
  );
}
