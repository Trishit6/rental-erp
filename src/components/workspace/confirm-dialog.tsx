import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  requireReason = false,
  requireTyped,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  onConfirm: (data: { reason?: string }) => void;
  requireReason?: boolean;
  requireTyped?: string;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const canConfirm = (!requireReason || reason.trim().length > 0) && (!requireTyped || typed === requireTyped);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-3">
          {requireReason ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Enter reason" />
            </div>
          ) : null}
          {requireTyped ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Type "{requireTyped}" to confirm</label>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canConfirm} onClick={() => onConfirm({ reason: reason || undefined })}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
