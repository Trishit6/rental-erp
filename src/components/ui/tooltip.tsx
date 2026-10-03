import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils/cn";

/**
 * The app's one tooltip.
 *
 * It exists because the floating controls had three different answers to the
 * same question — a native `title`, a permanently-rendered text label inside the
 * button, and nothing at all. A permanent label is the worst of the three: it
 * occupies layout, competes with the icon it annotates, and stays visible while
 * the control scrolls. Radix handles the parts that are easy to get wrong:
 * hover *and* keyboard focus, Escape to dismiss, the 700ms open delay so a
 * tooltip never fires while the pointer is just travelling across the rail, and
 * a focusable tooltip so `aria-describedby` is populated.
 *
 * Positioning is a `side` + `align` pair rather than free placement, because
 * every consumer is a control in the bottom-right rail and only a few positions
 * can stay inside the viewport there. The rail's own `z-index` puts tooltips
 * above the floating controls (see `--layer-*` in `styles.css`).
 */

const SIDE_CLASSES = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
  bottom: "left-1/2 top-full -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
} as const;

const ALIGN_CLASSES = {
  start: "left-0",
  center: "",
  end: "right-0",
} as const;

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  label,
  side = "left",
  align = "center",
  children,
}: {
  /** Announced to assistive tech as the button's description. */
  label: string;
  side?: keyof typeof SIDE_CLASSES;
  /** Only meaningful for the horizontal sides. */
  align?: keyof typeof ALIGN_CLASSES;
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            // `elev-raised` rather than a bespoke glow: a tooltip is a small
            // floating surface, so it takes the floating/raised rung.
            "elev-raised z-[var(--layer-modal)] w-max max-w-[220px] rounded-xl px-2.5 py-1.5",
            "text-[11px] font-semibold leading-tight text-foreground",
            SIDE_CLASSES[side],
            ALIGN_CLASSES[align],
          )}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
