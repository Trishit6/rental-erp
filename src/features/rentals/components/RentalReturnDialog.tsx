import { useState } from "react";
import { Loader2, PackageCheck } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { Rental } from "../types";

/**
 * Confirm starting a return.
 *
 * Deliberately **no method picker**. The sketch offers drop-off or pickup, but
 * nothing in the backend acts on a return method: there is no courier, no label
 * and no collection scheduling, so a radio group here would be a control that
 * looks meaningful and changes nothing. The spec asks for exposing only what is
 * actually supported, and right now the answer is "hand it to the seller".
 *
 * What this does do is real: it moves the rental to `RETURN_PENDING` and records
 * *when* the customer asked, which the timeline then shows. It does not mark the
 * item returned, and it does not promise a refund — the deposit is released only
 * after the owner confirms the return.
 */
export function RentalReturnDialog({
  open,
  onOpenChange,
  rental,
  isSubmitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rental: Rental;
  isSubmitting: boolean;
  onSubmit: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Start return"
      description="Let the seller know you're handing the item back."
      footer={
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            className="flex-1"
            disabled={isSubmitting || !acknowledged}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Requesting…
              </>
            ) : (
              "Start return"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <p className="inset-surface rounded-2xl p-4 text-sm text-muted-foreground">
          This marks the rental as <strong className="text-foreground">return requested</strong> and
          notifies the owner. It doesn&apos;t close the rental — the seller confirms once the item is
          physically back.
        </p>

        <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li>· Arrange to hand the item to the seller, or arrange collection with them.</li>
          <li>
            · Your{" "}
            <strong className="text-foreground">
              {rental.daysRemaining === 0 ? "return" : `${rental.daysRemaining} day remaining`}
            </strong>{" "}
            and rental charge are unaffected by this request.
          </li>
          <li>· Your deposit is released after the seller confirms the return.</li>
        </ul>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl bg-accent/10 p-3 text-xs leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
          />
          <span>
            I understand this only starts the return, and no refund is issued yet.
          </span>
        </label>

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <PackageCheck size={12} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Damage checks, shipping labels and refunds are handled by the seller and aren&apos;t
            automated yet.
          </span>
        </p>
      </div>
    </Sheet>
  );
}
