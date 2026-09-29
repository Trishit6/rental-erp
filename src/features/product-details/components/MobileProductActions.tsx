import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FavoriteControl, type FavoriteController } from "@/features/favorites/components/FavoriteButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { productActions } from "./schema";
import type { ListingMode, ProductAction } from "../types";

/**
 * Sticky mobile action bar. Slides in only once the inline actions have scrolled
 * out of view, sits inside the safe-area inset, and mirrors the desktop buttons
 * exactly (same handlers, same pending state) so the two can't drift.
 */
export function MobileProductActions({
  mode,
  available,
  visible,
  title,
  favorite,
  onAction,
  pendingActionId,
}: {
  mode: ListingMode;
  available: boolean;
  visible: boolean;
  /** The product's name, so the heart's accessible label names it. */
  title: string;
  /** The same controller the header heart uses — one state, two controls. */
  favorite: FavoriteController;
  onAction: (action: ProductAction) => void;
  pendingActionId: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const actions = productActions(mode, available);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduceMotion ? false : { y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { y: 90, opacity: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
        >
          <div className="border-t border-white/60 bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl dark:border-white/5">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <FavoriteControl
                title={title}
                isFavorited={favorite.isFavorited}
                isPending={favorite.isPending}
                isDisabled={favorite.isDisabled}
                onClick={favorite.toggle}
                variant="labelled"
              />

              {available ? (
                <div className="flex flex-1 gap-2">
                  {actions.map((action) => {
                    const pending = pendingActionId === action.id;
                    return (
                      <Button
                        key={action.id}
                        size="lg"
                        variant={action.tone === "primary" ? "default" : "secondary"}
                        disabled={pendingActionId !== null && !pending}
                        aria-busy={pending}
                        onClick={() => onAction(action)}
                        className={cn(
                          "flex-1",
                          action.tone === "secondary" && "hidden min-[400px]:inline-flex",
                        )}
                      >
                        {pending ? "Adding…" : action.label}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <p className="flex-1 text-center text-xs font-bold text-muted-foreground">
                  Currently unavailable
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
