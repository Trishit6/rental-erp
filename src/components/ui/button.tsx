import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils/cn";

/**
 * The app's single button family.
 *
 * Six variants, one size ladder and one set of states, so a "primary", "chip" or
 * "danger" control is the same object everywhere. `primary` aliases the original
 * `default`, and `danger` is the canonical destructive control — a solid,
 * contrast-checked fill — sitting alongside the original tonal `destructive`,
 * which is left untouched so its existing call sites do not shift.
 *
 * ## Where the "glow" went
 *
 * Every variant takes its shadow from the shared control ladder (`--elev-1` /
 * `--elev-pressed`, see `styles.css`), never a hand-written one. The primary and
 * secondary surfaces used to carry an `inset 0 1px 0 rgb(255 255 255 / …)` white
 * highlight, which is exactly the halo this pass removes.
 *
 * Focus is an accent-coloured ring at 2px with a 2px offset, and is never
 * removed. Disabled controls stop responding to the pointer; a `loading` button
 * announces `aria-busy`, shows a spinner, keeps its content width and blocks
 * clicks.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none aria-busy:pointer-events-none aria-busy:opacity-80",
  {
    variants: {
      variant: {
        // `primary` is the canonical name; `default` is kept for existing call sites.
        primary: "primary-button text-primary-foreground",
        default: "primary-button text-primary-foreground",
        secondary: "soft-button text-foreground",
        // `accent` is a tonal olive wash; `.accent-button` owns its colours.
        accent: "accent-button",
        // `danger` is the canonical destructive control: a solid fill that clears
        // 4.5:1 in both themes. `destructive` is the original tonal treatment, kept
        // unchanged so its existing call sites do not shift.
        danger: "danger-button",
        destructive:
          "border border-destructive/40 bg-destructive/12 text-destructive hover:bg-destructive/18",
        ghost: "text-foreground hover:bg-primary/10",
        inset: "inset-surface text-foreground",
        chip: "chip-surface text-foreground",
      },
      size: {
        // sm/md are `btn-compact`: they rise to a 44px touch target on coarse
        // pointers only (see `styles.css`), so desktop layout keeps its height.
        sm: "btn-compact h-8 px-3.5 text-xs",
        md: "btn-compact h-10 px-5 text-sm",
        default: "btn-compact h-10 px-5 text-sm",
        lg: "h-12 px-7 text-sm",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Show a spinner, announce `aria-busy` and block further clicks. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  // `asChild` forwards onto a single child (usually a `Link`), and Radix's `Slot`
  // throws if it is handed two. So the spinner is built *into* the content rather
  // than rendered as a sibling when `asChild` is false, and never added when it
  // is true.
  const content =
    !asChild && loading ? (
      <>
        <Loader2 size={15} className="animate-spin" aria-hidden />
        {children}
      </>
    ) : (
      children
    );
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </Component>
  );
}
