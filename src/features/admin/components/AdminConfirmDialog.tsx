import type { ReactNode } from "react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The admin workspace's one confirmation dialog.
 *
 * ## Why one dialog rather than one per action
 *
 * By the time this workspace finished, "suspend this account", "revoke this seller's
 * verification", "retire this category" and "remove this image" each wanted the same
 * thing: a title naming what will change, a body saying who it affects, a cancel, and a
 * confirm that shows a spinner and cannot be double-submitted. Four copies of that is
 * four chances to forget the spinner — and a double-submitted suspend is a support
 * ticket.
 *
 * The body accepts `ReactNode` so an action can say more than a sentence when it needs
 * to (the product delete dialog passes the archive-vs-delete consequence), while the
 * title, the pending state and the footer stay identical everywhere.
 *
 * ## Why the title is also the input
 *
 * `subject` is required and rendered in the title, so the dialog always names *which*
 * record is about to change. A confirmation that says "Are you sure?" with no subject
 * is not a confirmation — it is a coin toss the user has to guess the meaning of.
 */
export function AdminConfirmDialog({
  open,
  onOpenChange,
  subject,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  isSubmitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The record's identity — rendered in the title. Never optional. */
  subject: string;
  title?: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `destructive` for anything that takes access, money or data away. */
  tone?: "default" | "destructive";
  isSubmitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? `${confirmLabel}?`}</DialogTitle>
          <DialogDescription>{subject}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 text-sm text-muted-foreground">{body}</div>

        <DialogFooter className="mt-5">
          <Button
            type="button"
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting ? <Loader2 size={15} aria-hidden className="animate-spin" /> : null}
            {isSubmitting ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A confirmation triggered from a table row.
 *
 * Wraps the dialog above with the "which row is open" state every row-level
 * destructive action needs, so a page holds one piece of state instead of a boolean per
 * row, and closing the dialog always clears it.
 *
 * `request` is called with the row to open on; `null` closes. Keeping the shape as
 * `(row | null) => void` is what lets the same hook serve "suspend or restore", where
 * the same row produces two different confirmations.
 */
export function useConfirmTarget<Row>() {
  const [target, setTarget] = useState<Row | null>(null);
  const request = (row: Row | null) => setTarget(row);
  return { target, request, close: () => setTarget(null) };
}
