/**
 * U4 effect 04 — the homepage review deck ("review shuffle", client half).
 *
 * The data is real: `GET /api/reviews/featured` supplies up to six PUBLISHED,
 * four-star-or-better, verified-purchase reviews of 40–220 chars, with no user
 * ids or order references — the projection is deliberately narrower than the
 * shopfront card. The endpoint is `Cache-Control`-ed for 60 s, so the query
 * refreshes out-of-band every two minutes.
 *
 * Presentation: one review at a time cross-fades every DECK_TICK_MS, driven by
 * the shared loop hook (hidden tab / hover pause, page-wide two-loop cap
 * against the rotator and the pings). Respectful a11y is the same contract as
 * effect 02: the animated card is decoration, the sr-only list announces all
 * six reviews once, statically, and a screen reader user is never pinged by
 * a live region on a schedule.
 *
 * Fallback rules from the U4 spec: `fx.reviewShuffle` off does NOT hide the
 * data — the deck collapses to the same reviews as a plain static list,
 * because the featured endpoint is allowed to exist on its own. Reduced
 * motion takes the same fallback.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { api } from "@/lib/api/client";
import { isFxEnabled } from "@/lib/motion/flags";
import { useVisibleLoop } from "@/lib/motion/useVisibleLoop";
import { queryKeys } from "@/lib/query/keys";

/** The wire shape `GET /api/reviews/featured` publishes. */
export type FeaturedReview = {
  rating: number;
  title: string | null;
  comment: string;
  authorName: string;
  productTitle: string;
  productSlug: string;
};

/** One review holds the stage for this long. */
export const DECK_TICK_MS = 5_500;

export async function getFeaturedReviews(): Promise<FeaturedReview[]> {
  return (await api.get<{ reviews: FeaturedReview[] }>("/reviews/featured")).data.reviews;
}

export function useFeaturedReviews(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reviewsFeatured,
    queryFn: getFeaturedReviews,
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

/** The one line per card — wired exactly as it is rendered. */
export function deckLine(review: FeaturedReview): string {
  const title = review.title ? `${review.title} — ` : "";
  return `${title}“${review.comment}” ${review.authorName}, on ${review.productTitle}`;
}

export function ReviewDeck() {
  const prefersReducedMotion = useReducedMotion();
  const animating = isFxEnabled("fx.reviewShuffle") && !prefersReducedMotion;
  const { data: reviews } = useFeaturedReviews(true);

  const list = reviews ?? [];
  const [index, setIndex] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const running = useVisibleLoop(stageRef, { pauseOnHover: true, loopId: "review-deck" });

  const count = list.length;

  useEffect(() => {
    if (!animating || !running || count === 0) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % count),
      DECK_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [animating, running, count]);

  if (count === 0) return null;

  const stars = (n: number): ReactNode[] =>
    Array.from({ length: n }, (_, i) => (
      <Star key={i} size={13} aria-hidden className="fill-current text-amber-500" />
    ));

  return (
    <section className="page-wrap pt-2" aria-label="Featured reviews">
      <h2 className="text-xl font-bold tracking-tight">What buyers say</h2>

      {animating ? (
        <div ref={stageRef} className="mt-4">
          {/* Animated stage: one review at a time, cross-fading in place. */}
          <div className="relative min-h-44 [grid-area:1/1] grid">
            <AnimatePresence>
              {running && (
                <motion.blockquote
                  key={list[Math.min(index, count - 1)]!.authorName + index}
                  aria-hidden="true"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="raised-surface rounded-3xl p-5 [grid-area:1/1]"
                >
                  <ReviewBody review={list[Math.min(index, count - 1)]!} stars={stars} />
                </motion.blockquote>
              )}
            </AnimatePresence>
          </div>

          {/* Screen readers read all six once, statically — no live region. */}
          <ul className="sr-only">
            {list.map((review, i) => (
              <li key={`${review.productSlug}-${i}`}>{deckLine(review)}</li>
            ))}
          </ul>

          <ReviewProgress
            count={count}
            index={Math.min(index, count - 1)}
            onPick={setIndex}
          />
        </div>
      ) : (
        /* Flag off / reduced motion: the same reviews, as a static list. */
        <ul className="mt-4 grid gap-3">
          {list.slice(0, 3).map((review, i) => (
            <li key={`${review.productSlug}-${i}`} className="inset-surface rounded-2xl p-4">
              <ReviewBody review={review} stars={stars} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Card content, shared by the animated stage and the static fallback. */
function ReviewBody({
  review,
  stars,
}: {
  review: FeaturedReview;
  stars: (n: number, className?: string) => ReactNode[];
}) {
  return (
    <>
      <div aria-label={`${review.rating} out of 5 stars`} className="flex gap-0.5">
        {stars(review.rating)}
      </div>
      {review.title && <p className="mt-2 text-sm font-bold">{review.title}</p>}
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {review.comment}
      </p>
      <footer className="mt-3 text-xs font-semibold">
        {review.authorName} ·{" "}
        <Link
          to="/product/$slug"
          params={{ slug: review.productSlug }}
          className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {review.productTitle}
        </Link>
      </footer>
    </>
  );
}

/** One dot per review; every dot is a real button, so the deck is steerable. */
function ReviewProgress({
  count,
  index,
  onPick,
}: {
  count: number;
  index: number;
  onPick: (next: number) => void;
}) {
  return (
    <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="Review position">
      {Array.from({ length: count }, (_, dot) => (
        <button
          key={dot}
          type="button"
          role="tab"
          aria-selected={dot === index}
          aria-label={`Show review ${dot + 1} of ${count}`}
          onClick={() => onPick(dot)}
          className={`size-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            dot === index ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
          }`}
        />
      ))}
    </div>
  );
}
