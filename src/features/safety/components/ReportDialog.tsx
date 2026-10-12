import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitReport } from "../query";
import type { ReportTarget } from "../types";

/**
 * The reasons a report may cite.
 *
 * One short, ordered list across every target rather than a per-kind vocabulary:
 * a moderator triages on the same words however the report arrived, and a user
 * learns one set. `reason` is capped at 32 characters server-side, which every
 * label here respects.
 */
export const REPORT_REASONS = [
  { value: "Spam or scam", label: "Spam or scam" },
  { value: "Harassment or abuse", label: "Harassment or abuse" },
  { value: "Counterfeit or prohibited", label: "Counterfeit or prohibited item" },
  { value: "Misleading or fraud", label: "Misleading or fraudulent" },
  { value: "Something else", label: "Something else" },
] as const;

/**
 * The report form.
 *
 * Controlled by the caller (`open` / `onOpenChange`) so a trigger button owns nothing
 * but the open flag and the dialog can be tested on its own. On success the mutation's
 * `onSuccess` here closes the dialog and clears the details; on failure the dialog
 * stays open with what was typed, because losing a report to a transient error is the
 * one outcome a report form must not have.
 */
export function ReportDialog({
  target,
  open = true,
  onOpenChange,
}: {
  target: ReportTarget;
  open?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");
  const submit = useSubmitReport();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit.mutate(
      { target, reason, details },
      {
        onSuccess: () => {
          setDetails("");
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="report-dialog">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Report {target.label ?? "content"}</DialogTitle>
            <DialogDescription>
              Tell us what&apos;s wrong. Reports go to moderators, who review every one. The person
              you report is not told who reported them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="report-reason" className="block text-sm font-bold">
              Reason
            </label>
            <NativeSelect
              id="report-reason"
              label="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              options={[...REPORT_REASONS]}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="report-details" className="block text-sm font-bold">
              Details <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="report-details"
              aria-label="Details"
              value={details}
              maxLength={1000}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Add anything that will help moderators understand."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
