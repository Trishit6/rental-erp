import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminConfirmDialog } from "./AdminConfirmDialog";

/**
 * The two bulk actions that are not a status change.
 *
 * `AdminConfirmDialog` cannot serve the category move — that needs a *destination*, not
 * a reason — so it gets its own dialog, and the delete reuses the confirm dialog because
 * it is exactly the shape that dialog exists for (a destructive, reason-bearing action).
 *
 * Both are scoped by the caller to the current page's selection, which is why neither
 * holds ids itself: the ids travel with the confirm callback so the action cannot fire
 * against a stale selection.
 */

export function AdminBulkCategoryDialog({
  open,
  count,
  categories,
  submitting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  count: number;
  categories: { id: number; name: string }[];
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (categoryId: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Move {count} listing{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Choose the category the selected listings should move into. The change is written
            to the audit log.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while the dialog is open, so the destination resets with the
            dialog rather than needing an effect to clear it. */}
        <BulkCategoryForm
          categories={categories}
          submitting={submitting}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function BulkCategoryForm({
  categories,
  submitting,
  onCancel,
  onConfirm,
}: {
  categories: { id: number; name: string }[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (categoryId: number) => void;
}) {
  const [categoryId, setCategoryId] = useState("");

  return (
    <>
      <div className="mt-4">
        <NativeSelect
          label="Destination category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={[
            { value: "", label: "Choose a category…" },
            ...categories.map((category) => ({
              value: String(category.id),
              label: category.name,
            })),
          ]}
        />
      </div>

      <DialogFooter className="mt-5">
        <Button type="button" variant="secondary" disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={submitting || categoryId === ""}
          onClick={() => onConfirm(Number(categoryId))}
        >
          {submitting ? <Loader2 size={15} aria-hidden className="animate-spin" /> : null}
          {submitting ? "Moving…" : "Move listings"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AdminBulkDeleteDialog({
  open,
  count,
  submitting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  count: number;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  return (
    <AdminConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      subject={`${count} listing${count === 1 ? "" : "s"} selected`}
      title={`Delete ${count} listing${count === 1 ? "" : "s"}?`}
      body={
        <p>
          Listings with order history are archived instead of deleted, so customers keep
          their receipts. Anything else is removed outright. This cannot be undone.
        </p>
      }
      confirmLabel="Delete listings"
      tone="destructive"
      requireReason
      reasonLabel="Reason (recorded in the audit log)"
      isSubmitting={submitting}
      onConfirm={onConfirm}
    />
  );
}
