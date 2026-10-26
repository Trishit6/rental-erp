import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Loader2, Lock } from "lucide-react";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  locked?: boolean;
  mixed?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * A labelled pill switch: `<label>` wraps a visually-hidden native checkbox
 * plus a visible pill, following the peer-pattern (no custom-switch CSS tricks).
 *
 * The track is a fixed 44x24 (w-11 h-6) pill with `shrink-0` so it can never
 * collapse in a flex row. The thumb is `size-5` (20px) positioned with
 * `top-0.5 left-0.5` and translates `translate-x-5` (20px) when checked.
 *
 * ## Why the old implementation collapsed into a circle
 *
 * The track was `inline-block h-6 w-11 shrink-0 rounded-full` and the thumb was
 * `absolute top-0.5 size-5 rounded-full`. Three things were wrong:
 *
 *  1. **No fixed width on the track.** `w-11` (44px) was never applied. The
 *     track's width collapsed to the `sr-only` input (which is `width: 1px`),
 *     then `rounded-full` stretched the 24px-tall box into a 24px circle.
 *     The observed 56px blob was the `label` element — an `inline-flex`
 *     container — expanding to fit the thumb plus the 4px (two
 *     `0.5`-unit) horizontal `left` offsets and the 20px thumb, i.e.
 *     about 20 + 4 + 20 + 4 ≈ 48-56px, and a `rounded-full` on an inline
 *     flex container rounds the *whole* line to the tallest child's height.
 *
 *  2. **The thumb was positioned relative to the wrong ancestor.** It was
 *     `absolute` inside a track that was `inline-block`, so the containing
 *     block was the *line box* of the inline flex row, not the track box.
 *     That is why the thumb sat at the top-left (the first baseline of the
 *     line box) instead of slid from the left edge of the track.
 *
 *  3. **A global `button` style was forcing `aspect-ratio` / padding / height
 *     on the track.** The track is a `<span>`, but the `label` wrapper is an
 *     inline element and any `button`-like rule that applies
 *     `aspect-ratio: 1 / 1` or `min-width: 0` to `span` would have stretched
 *     the 24px-tall track to a circle and undone the `h-6`.
 *
 * The fix: the track gets an explicit `min-w-0` to stop flex-shrink from
 * letting it shrink under a flex-shrinking sibling, an explicit `h-6` and
 * `w-11` (44x24), `shrink-0`, and `p-0` so no padding or button-style
 * leak in. The thumb gets `absolute left-0.5 top-0.5` *relative to the track*
 * (the track is `relative`), `size-5` (20px), and `translate-x-5` (20px) when
 * checked so it ends exactly at the right edge of the track. box-sizing is
 * `border-box` globally in `src/styles.css`, so `w-11` includes any border.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    checked: controlled,
    defaultChecked = false,
    onCheckedChange,
    disabled,
    loading,
    locked,
    mixed,
    className,
    id,
    ...props
  },
  ref,
) {
  const [uncontrolled, setUncontrolled] = useState(defaultChecked);
  const checked = controlled ?? uncontrolled;
  const isDisabled = disabled || loading || locked;

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2.5",
        className,
      )}
      {...props}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={mixed ? ("mixed" as any) : checked}
        aria-busy={loading || undefined}
        disabled={isDisabled}
        defaultChecked={defaultChecked}
        onChange={(_e) => {
          if (!isDisabled) {
            const next = !checked;
            if (controlled === undefined) setUncontrolled(next);
            onCheckedChange?.(next);
          }
        }}
        className="peer sr-only h-6 w-11 shrink-0 rounded-full border border-border bg-[var(--inset-bg)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed"
      />
      <span
        className={cn(
          "relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          isDisabled && "opacity-60",
          mixed
            ? "bg-muted border border-border"
            : checked
              ? "bg-[oklch(0.68_0.09_50)]"
              : "bg-[var(--inset-bg)] border border-border",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-150 dark:bg-white/90",
            checked && !mixed && "translate-x-5",
            mixed && "translate-x-2.5",
          )}
        />
        {(loading || locked) && (
          <span className="absolute inset-0 flex items-center justify-center">
            {loading ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              <Lock size={12} aria-hidden />
            )}
          </span>
        )}
      </span>
    </label>
  );
});

Switch.displayName = "Switch";
