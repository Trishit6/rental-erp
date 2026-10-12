import { Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fulfillmentLabel, type BulkFulfillmentPayload } from "../types";

/**
 * The bulk action bar.
 *
 * ## Two states, one surface
 *
 * While a batch is *selected*, the bar offers the steps every selected order can
 * take (the intersection — the server applies one target to all of them and
 * refuses the whole batch if any line disagrees). Once a step is chosen, the bar
 * switches to the *pending* batch and offers Undo for the length of the window;
 * nothing has been sent yet, so undo is instant and has nothing to reverse.
 *
 * Keeping both states in one bar rather than a toast means the pending batch is
 * visible exactly where the selection was, and it cannot scroll out of view
 * before the window closes.
 */
export function BulkActionsBar({
  selectedCount,
  nextStates,
  pending,
  busy,
  onApply,
  onUndo,
  onClear,
}: {
  selectedCount: number;
  nextStates: string[];
  pending: BulkFulfillmentPayload | null;
  busy: boolean;
  onApply: (status: string) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  if (pending) {
    return (
      <div
        role="status"
        className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(92vw,40rem)] flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-foreground)] px-5 py-3 text-primary-foreground shadow-xl"
      >
        <p className="text-sm font-semibold">
          Marking {pending.references.length} {pending.references.length === 1 ? "order" : "orders"}{" "}
          {fulfillmentLabel(pending.status).toLowerCase()}
          {busy ? "…" : ""}
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={onUndo}>
          <Undo2 size={14} aria-hidden />
          Undo
        </Button>
      </div>
    );
  }

  if (selectedCount === 0) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(92vw,40rem)] flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-foreground)] px-5 py-3 text-primary-foreground shadow-xl"
    >
      <p className="text-sm font-semibold">
        {selectedCount} {selectedCount === 1 ? "order" : "orders"} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {nextStates.length === 0 ? (
          <span className="text-xs text-primary-foreground/70">
            No shared step for this selection.
          </span>
        ) : (
          nextStates.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => onApply(status)}
            >
              Mark {fulfillmentLabel(status).toLowerCase()}
            </Button>
          ))
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          <X size={14} aria-hidden />
          Clear
        </Button>
      </div>
    </div>
  );
}
