import { useEffect, type RefObject, useRef, useState } from "react";
import { pickRunningLoops } from "./loop-capacity";

type Gate = { inView: boolean; docVisible: boolean; interactive: boolean };
type Entry = { el: HTMLElement; gate: { current: Gate } };

/**
 * The one pause engine for every continuous U4 loop (rotator, review deck,
 * cursor tour, pings): a loop runs only while ALL of these hold —
 *
 *  - its element is in view (IntersectionObserver),
 *  - the document is visible (`visibilitychange`),
 *  - the pointer is not hovering it and nothing inside it has focus.
 *
 * Page-wide cap of two concurrent loops, decided by document order
 * (`loop-capacity.ts#pickRunningLoops`): earlier claimants win, later ones
 * wait. The hook does not run any interval itself — callers schedule their own
 * work only while the return value is true, so a paused loop does nothing.
 */
export function useVisibleLoop(
  ref: RefObject<HTMLElement | null>,
  opts: { pauseOnHover?: boolean; rootMargin?: string; loopId: string },
): boolean {
  const { pauseOnHover = true, rootMargin = "0px", loopId } = opts;
  const [running, setRunning] = useState(false);
  const gate = useRef<Gate>({ inView: false, docVisible: true, interactive: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entry: Entry = { el, gate };
    registry.set(loopId, entry);
    notifyListeners.set(loopId, setRunning);

    const observer = new IntersectionObserver(
      (entries) => {
        gate.current.inView = entries.some((e) => e.isIntersecting);
        recompute();
      },
      { rootMargin },
    );
    observer.observe(el);

    const onVisibility = () => {
      gate.current.docVisible = !document.hidden;
      recompute();
    };
    const onEnter = () => {
      gate.current.interactive = true;
      recompute();
    };
    const onLeave = () => {
      gate.current.interactive = false;
      recompute();
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (pauseOnHover) {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
      el.addEventListener("focusin", onEnter);
      el.addEventListener("focusout", onLeave);
    }

    recompute();

    return () => {
      registry.delete(loopId);
      notifyListeners.delete(loopId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (pauseOnHover) {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
        el.removeEventListener("focusin", onEnter);
        el.removeEventListener("focusout", onLeave);
      }
      recompute();
    };
    // The registry is page-wide module state; ref identity is stable, so this
    // effect belongs to the loopId alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopId, pauseOnHover, rootMargin]);

  return running;
}

/** Module-level registry — every loop on the page shares it. */
const registry = new Map<string, Entry>();
const notifyListeners = new Map<string, (running: boolean) => void>();
let granted = new Set<string>();

function wantsToRun(entry: Entry): boolean {
  return (
    entry.gate.current.inView &&
    entry.gate.current.docVisible &&
    !entry.gate.current.interactive
  );
}

function recompute() {
  const all = [...registry.entries()].map(([id, entry]) => ({ id, entry }));
  // Document order via compareDocumentPosition, so the cap is deterministic no
  // matter which effect mounted first.
  all.sort((a, b) => {
    if (a.entry.el === b.entry.el) return 0;
    return a.entry.el.compareDocumentPosition(b.entry.el) &
      Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1;
  });
  const next = pickRunningLoops(
    all.map(({ id, entry }, index) => ({ id, order: index, wants: wantsToRun(entry) })),
  );
  const before = granted;
  granted = next;
  for (const id of new Set([...before, ...next])) {
    if (before.has(id) !== next.has(id)) notifyListeners.get(id)?.(next.has(id));
  }
}

/** Test/diagnostic hook: loop ids currently granted to run. */
export function grantedLoopsForTesting(): Set<string> {
  return new Set(granted);
}
