import {
  FavoriteControl,
  type FavoriteController,
} from "@/features/favorites/components/FavoriteButton";
import { Button } from "@/components/ui/button";
import { MobileActionBar } from "@/lib/floating/mobile-action-bar";
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
  const actions = productActions(mode, available);

  return (
    <MobileActionBar visible={visible}>
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
    </MobileActionBar>
  );
}
