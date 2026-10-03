import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * The app's one bottom-right floating rail.
 *
 * Four controls used to position themselves independently from that corner —
 * the home dock (`bottom-5 right-5`), the assistant launcher (`bottom-5
 * right-5`), go-to-top (`bottom-[104px] right-5`), plus a mobile dock on browse
 * and one on categories. Three of them landed on top of each other, and the one
 * that had been given a hand-computed pixel offset specifically to *avoid*
 * colliding (`bottom-[104px]`) had to be re-tuned by hand every time a button
 * changed size or a breakpoint moved.
 *
 * The fix is to stop positioning controls at all. Each one claims a slot and
 * renders into the rail, which owns the corner, the stacking order, the gap and
 * the responsive/safe-area offsets. Slots render in `SLOT_ORDER`, not in mount
 * order — which matters because the assistant is mounted by the root layout and
 * would therefore always come first in the DOM, ahead of the home dock that
 * belongs above it.
 *
 * The rail is shared state that several features read, so it lives in `lib/`
 * alongside the cart drawer rather than in `components/`, which would force the
 * features to import each other.
 */

/** Top of the column to the bottom. The assistant is last: it is the one
 *  control every other floating affordance is positioned relative to. */
const SLOT_ORDER = ["filters", "cart", "browse", "sell", "top", "chat"] as const;

export type FloatingSlot = (typeof SLOT_ORDER)[number];

const EMPTY_SLOTS: ReadonlySet<FloatingSlot> = new Set();
const EMPTY_ANCHORS: ReadonlyMap<FloatingSlot, HTMLElement> = new Map();

/**
 * Actions and state are deliberately in two contexts.
 *
 * `useFloatingSlot` subscribes to both, and its acquire/release effect may only
 * depend on the *actions*. With one combined context the value's identity would
 * change every time a slot was attached — which is exactly what the effect it
 * guards causes — so the effect would release and re-acquire forever.
 */
type RailActions = {
  /** Announce that a control wants a slot. Returns its release function. */
  acquire: (slot: FloatingSlot) => () => void;
  /** Publish the element a slot's control should portal into. */
  attach: (slot: FloatingSlot, element: HTMLElement | null) => void;
};

type RailState = {
  occupied: ReadonlySet<FloatingSlot>;
  anchors: ReadonlyMap<FloatingSlot, HTMLElement>;
};

const RailActionsContext = createContext<RailActions | null>(null);
const RailStateContext = createContext<RailState | null>(null);

/**
 * Wraps the route tree. Mounted once by the root layout, *above* both the
 * controls that claim slots and the rail that renders them, so a control can be
 * declared anywhere in the app and still land in the same column.
 */
export function FloatingRailProvider({ children }: { children: ReactNode }) {
  const [occupied, setOccuped] = useState<ReadonlySet<FloatingSlot>>(EMPTY_SLOTS);
  const [anchors, setAnchors] = useState<ReadonlyMap<FloatingSlot, HTMLElement>>(EMPTY_ANCHORS);

  const acquire = useCallback((slot: FloatingSlot) => {
    setOccuped((current) => {
      if (current.has(slot)) return current;
      const next = new Set(current);
      next.add(slot);
      return next;
    });
    return () => {
      setOccuped((current) => {
        if (!current.has(slot)) return current;
        const next = new Set(current);
        next.delete(slot);
        return next;
      });
      setAnchors((current) => {
        if (!current.has(slot)) return current;
        const next = new Map(current);
        next.delete(slot);
        return next;
      });
    };
  }, []);

  const attach = useCallback((slot: FloatingSlot, element: HTMLElement | null) => {
    setAnchors((current) => {
      // Element identity is stable across renders, so this only commits on
      // mount and unmount — a ref callback can never feed back into itself.
      if (element ? current.get(slot) === element : !current.has(slot)) return current;
      const next = new Map(current);
      if (element) next.set(slot, element);
      else next.delete(slot);
      return next;
    });
  }, []);

  const actions = useMemo(() => ({ acquire, attach }), [acquire, attach]);
  const state = useMemo(() => ({ occupied, anchors }), [occupied, anchors]);

  return (
    <RailActionsContext.Provider value={actions}>
      <RailStateContext.Provider value={state}>{children}</RailStateContext.Provider>
    </RailActionsContext.Provider>
  );
}

/**
 * The rail itself: the single fixed column that owns the corner.
 *
 * Rendered once, by the root layout. Each occupied slot gets one anchor in
 * `SLOT_ORDER`; controls portal their own markup into theirs.
 */
export function FloatingRail() {
  const state = useContext(RailStateContext);
  const columnRef = useRef<HTMLDivElement>(null);
  const slots = SLOT_ORDER.filter((slot) => state?.occupied.has(slot));

  // Anything that must sit *above* the rail — the assistant's chat panel —
  // reads this instead of guessing a pixel offset that goes stale the moment a
  // control is added or hidden.
  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const root = column.ownerDocument.documentElement;
    const publish = () =>
      root.style.setProperty("--floating-rail-height", `${Math.ceil(column.offsetHeight)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(column);
    return () => observer.disconnect();
  }, [slots.length]);

  return (
    <div className="floating-rail">
      <div ref={columnRef} className="flex flex-col items-center gap-2.5 sm:gap-3">
        {slots.map((slot) => (
          <SlotAnchor key={slot} slot={slot} />
        ))}
      </div>
    </div>
  );
}

/** One slot's portal target. Split out so only it re-renders when anchors move. */
function SlotAnchor({ slot }: { slot: FloatingSlot }) {
  const actions = useContext(RailActionsContext);

  // This *must* be a stable callback. An inline arrow gets a new identity on
  // every render, and React responds by calling the old one with `null` and the
  // new one with the node — so `attach` would alternate delete/set, re-render,
  // and repeat forever. With a stable identity React only calls it on mount and
  // unmount, which is exactly when the anchor actually changes.
  const ref = useCallback(
    (element: HTMLDivElement | null) => actions?.attach(slot, element),
    [actions, slot],
  );

  return <div className="flex items-center justify-center" ref={ref} />;
}

/**
 * Claim a slot in the rail and get the element to portal into.
 *
 * `active` exists so a control that appears and disappears — go-to-top, which is
 * hidden until the page has scrolled — does not reserve an empty slot (and the
 * gap that goes with it) for the whole session.
 *
 * The anchor does not exist on the first render (the rail has not committed the
 * slot yet), so this returns `null` for that one pass rather than deferring the
 * control's appearance behind an effect.
 */
export function useFloatingSlot(slot: FloatingSlot, active = true): HTMLElement | null {
  const actions = useContext(RailActionsContext);
  const state = useContext(RailStateContext);

  useEffect(() => {
    if (!actions || !active) return;
    return actions.acquire(slot);
  }, [actions, slot, active]);

  if (!active || !state?.occupied.has(slot)) return null;
  return state.anchors.get(slot) ?? null;
}

/**
 * Render `children` into a rail slot.
 *
 * Prefer this over `useFloatingSlot` + `createPortal` at the call site: it is the
 * only place that has to know what to do when there is no rail.
 *
 * With no rail — a feature rendered in isolation, such as a page test that
 * mounts one component — the children render **in normal flow**. Not `fixed`,
 * and not nothing: a control that vanished because its container was missing is
 * worse than one that reflows, and in-flow markup cannot overlap anything,
 * which is the entire point of this module.
 */
export function FloatingSlotContent({
  slot,
  active = true,
  children,
}: {
  slot: FloatingSlot;
  active?: boolean;
  children: ReactNode;
}) {
  const anchor = useFloatingSlot(slot, active);
  return anchor ? createPortal(children, anchor) : <>{children}</>;
}
