/**
 * Pure scheduling core for the page-wide loop cap (U4 guardrail): at most two
 * continuous loops may run at the same time on one page, and when more want to
 * run, the ones earlier in the document win while the rest wait.
 *
 * Kept pure so the pause rules and the cap are testable without a browser:
 * `useVisibleLoop` maps its live state onto this shape and asks who runs.
 */
export type LoopClaimant = {
  /** Stable identity for equality across recomputes (e.g. the effect name). */
  id: string;
  /** Document order (lower = earlier). Two equal values keep input order. */
  order: number;
  /** The loop's own gate passed: in view, visible document, not hovered. */
  wants: boolean;
};

/**
 * Pick which claimants run. Unstable for equal ids is caller's problem; the
 * result is a set of ids whose members may animate this frame.
 */
export function pickRunningLoops(
  claimants: readonly LoopClaimant[],
  maxConcurrent = 2,
): Set<string> {
  const wanting = claimants.filter((c) => c.wants);
  const byOrder = [...wanting].sort((a, b) =>
    a.order === b.order ? 0 : a.order < b.order ? -1 : 1,
  );
  // Stable ties: Array.prototype.sort is stable in modern engines, but sort
  // explicitly so equality reads the same after the pure function is reused.
  const running = new Set<string>();
  for (const claimant of byOrder) {
    if (running.size >= maxConcurrent) break;
    running.add(claimant.id);
  }
  return running;
}
