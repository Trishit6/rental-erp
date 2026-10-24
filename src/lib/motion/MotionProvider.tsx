import { MotionConfig } from "framer-motion";
import { useReduceAnimations } from "./reduce-preference";

/**
 * Shared motion context for the U4 effects.
 *
 * When the in-app "Reduce animations" preference is on, `reducedMotion="always"`
 * makes every effect in the tree resolve to its defined *final* state — text
 * complete, numbers final, lines fully drawn, tiles in place. With the
 * preference off, `"user"` keeps deferring to the OS `prefers-reduced-motion`
 * setting, so both channels are honored and neither overrides the other.
 *
 * Mounted in `src/main.tsx` above the router, so route-level code splitting
 * never produces a subtree that misses the provider.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduce = useReduceAnimations();
  return (
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>{children}</MotionConfig>
  );
}
