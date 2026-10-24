/**
 * U4 effect 03 — sale pings (the client half).
 *
 * The privacy-clean feed comes from the server (`server/lib/social-proof.ts`
 * and `GET /api/social-proof/recent`): it is already delayed by ≥ 10 minutes,
 * capped at a 24 h window, name/id/ts-free, city-visible only with k = 3 and
 * emptied below 5 events. The client's job is purely presentation:
 *
 *  - fetch the feed with TanStack Query (the endpoint is `Cache-Control`-ed
 *    for 60 s server-side, so a refetchInterval under that is pointless —
 *    the feed refreshes every two minutes *out of* the cache);
 *  - show one ping at a time, low in the corner, every 12 s for 6 s each,
 *    driven by the shared loop hook — paused while the tab is hidden or the
 *    toast is hovered, and subject to the page-wide two-loop cap;
 *  - reduced motion renders nothing: a ping is a decorative notification
 *    about somebody else's activity, and there is no honest non-motion
 *    version of "someone just bought X" a visitor would want stamped on
 *    every page they open;
 *  - no live region: a calendary "someone bought a kettle" every twelve
 *    seconds is noise for a screen reader user, and the ping is an
 *    ordinary navigational link for those who want to follow it.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { isFxEnabled } from "@/lib/motion/flags";
import { useVisibleLoop } from "@/lib/motion/useVisibleLoop";
import { queryKeys } from "@/lib/query/keys";

/** The wire shape the server publishes — mirrored here, not re-invented. */
export type ProofEvent = {
  kind: "rented" | "bought" | "listed";
  productTitle: string;
  productSlug: string;
  image: string | null;
  city: string | null;
  /** The only time signal: a coarse bucket, never a timestamp. */
  bucket: "10-30 min" | "1 h" | "today";
};

/** One ping takes the floor for this long, then leaves until the next tick. */
export const PING_VISIBLE_MS = 6_000;
/** New pings appear this often (well over the server's 60 s cache window). */
export const PING_TICK_MS = 12_000;

export async function getRecentProofEvents(): Promise<ProofEvent[]> {
  return (await api.get<{ events: ProofEvent[] }>("/social-proof/recent")).data.events;
}

export function useSocialProofFeed(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.socialProof,
    queryFn: getRecentProofEvents,
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

/** Bucket → display time. Coarse on purpose; see the server module. */
export function pingAgo(bucket: ProofEvent["bucket"]): string {
  if (bucket === "10-30 min") return "10–30 min ago";
  if (bucket === "1 h") return "about 1 h ago";
  return "earlier today";
}

export function SalePings() {
  const prefersReducedMotion = useReducedMotion();
  // Rendering kill switch from the U4 spec: flag off → no component, no query.
  const active = isFxEnabled("fx.salePings") && !prefersReducedMotion;
  const { data: events } = useSocialProofFeed(active);

  const list = events ?? [];
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const running = useVisibleLoop(containerRef, { pauseOnHover: true, loopId: "sale-pings" });

  const count = list.length;

  // Advance the pointer only while the gate holds. No synchronous setState in
  // the pause branch — visibility is derived at render, so a paused loop just
  // stops rendering while its container stays registered for the gate.
  useEffect(() => {
    if (!active || !running || count === 0) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % count),
      PING_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [active, running, count]);

  // Each pointer position shows its event once for PING_VISIBLE_MS, then the
  // floor is empty until the next tick — a ping that never leaves would be a
  // permanent overlay, not a pulse. Both flips go through timers so no effect
  // paints twice in one pass.
  useEffect(() => {
    if (!active || !running || count === 0) return;
    const show = window.setTimeout(() => setVisible(true), 0);
    const hide = window.setTimeout(() => setVisible(false), PING_VISIBLE_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
    // count and running are guards; the pointer position alone drives the show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, active, running, count]);

  if (!active || count === 0) return null;

  const event = list[Math.min(index, count - 1)] ?? list[0];
  const place = event.city ? ` in ${event.city}` : "";

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed bottom-4 left-4 z-40 max-w-80"
    >
      <AnimatePresence>
        {running && visible && (
          <motion.div
            key={`${event.kind}-${event.productSlug}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="pointer-events-auto raised-surface rounded-2xl p-3 shadow-sm hover:shadow-md"
          >
            <Link
              to="/product/$slug"
              params={{ slug: event.productSlug }}
              className="block text-xs leading-relaxed hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="font-semibold">Someone just {event.kind}</span>{" "}
              <span className="text-muted-foreground">
                {event.productTitle}
                {place} · {pingAgo(event.bucket)}
              </span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
