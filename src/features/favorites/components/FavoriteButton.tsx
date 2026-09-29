import { motion, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useFavoriteToggle } from "@/lib/query/favorites";
import { favoriteButtonLabel } from "./schema";

/**
 * THE favourite control. One implementation, used by Home, Browse, Product
 * Details, Related products and the wishlist — there is no second heart anywhere
 * in Revaro.
 *
 * It comes in two shapes:
 *  - `icon`   a floating round button over a product image (cards).
 *  - `labelled` an icon + word button (the product page's mobile action bar).
 *
 * `controller` lets a page own one toggle and hand it to two controls (the
 * product page shows a heart in its header *and* in its mobile bar) so they can
 * never run two mutations or disagree about the pending state. Without it the
 * button creates and owns its own.
 */
export type FavoriteController = ReturnType<typeof useFavoriteToggle>;

type FavoriteButtonProps = {
  productId: number | undefined;
  /** Used for the accessible label — "Add Sony WH-1000XM5 to favorites". */
  title: string;
  /** Product detail key, so the page's own counter stays in step. */
  slug?: string;
  /** The `isFavorited` the product payload already carried, when there is one. */
  hint?: boolean;
  variant?: "icon" | "labelled";
  /** Extra classes for the trigger (positioning over a card image, etc). */
  className?: string;
  /** Only used when the button creates its own controller. */
  onRemoved?: (info: { productId: number; slug?: string; title: string }) => void;
  controller?: FavoriteController;
};

export function FavoriteButton({
  productId,
  title,
  slug,
  hint,
  variant = "icon",
  className,
  onRemoved,
  controller,
}: FavoriteButtonProps) {
  // Always call the hook (hooks cannot be conditional); ignore it when the page
  // supplies a shared controller. An extra subscription to the same cache entry
  // costs nothing and keeps the two paths on one implementation.
  const own = useFavoriteToggle({
    productId,
    slug,
    hint,
    onRemoved: onRemoved ? (info) => onRemoved({ ...info, title }) : undefined,
  });
  const state = controller ?? own;

  return (
    <FavoriteControl
      title={title}
      isFavorited={state.isFavorited}
      isPending={state.isPending}
      isDisabled={state.isDisabled}
      variant={variant}
      className={className}
      onClick={state.toggle}
    />
  );
}

/**
 * The presentational heart. Split out so a page that owns one controller can
 * render it in several places (and so it can be tested without a router).
 */
export function FavoriteControl({
  title,
  isFavorited,
  isPending,
  isDisabled,
  variant = "icon",
  className,
  onClick,
}: {
  title: string;
  isFavorited: boolean;
  isPending: boolean;
  isDisabled: boolean;
  variant?: "icon" | "labelled";
  className?: string;
  onClick: () => void;
}) {
  const reduceMotion = useReducedMotion();
  // Distinct labels per state — the same label for both would tell a screen
  // reader user nothing about what the button will do.
  const label = favoriteButtonLabel(title, isFavorited);

  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={isFavorited}
      aria-busy={isPending}
      title={label}
      disabled={isDisabled}
      onClick={onClick}
      whileTap={reduceMotion || isDisabled ? undefined : { scale: 0.85 }}
      whileHover={reduceMotion || isDisabled ? undefined : { scale: 1.06 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      className={cn(
        "soft-button inline-flex items-center justify-center gap-2 rounded-full transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-70",
        variant === "labelled" ? "h-11 px-4 text-sm font-bold" : "size-9",
        // The saved state reads as "filled + accent" in both themes; it never
        // goes neon, it uses the burnt-orange token.
        isFavorited ? "text-primary" : "text-muted-foreground hover:text-primary",
        className,
      )}
    >
      <motion.span
        key={isFavorited ? "favorited" : "idle"}
        initial={reduceMotion ? false : { scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        className="inline-flex"
      >
        <Heart
          size={variant === "labelled" ? 18 : 16}
          fill={isFavorited ? "currentColor" : "none"}
          aria-hidden
          className={cn("transition-opacity duration-200", isPending && "opacity-50")}
        />
      </motion.span>
      {variant === "labelled" && (
        <span>{isPending ? "Saving…" : isFavorited ? "Saved" : "Save"}</span>
      )}
      {/* Announced by screen readers, and nothing is shown visually — the label
          already changes, so this only clarifies an in-flight request. */}
      <span className="sr-only" aria-live="polite">
        {isPending ? "Updating favorites" : ""}
      </span>
    </motion.button>
  );
}
