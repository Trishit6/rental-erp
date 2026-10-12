import { useState } from "react";
import type { ReactNode } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportDialog } from "./ReportDialog";
import type { ReportTarget } from "../types";

/**
 * A "Report" trigger that owns only the open flag for `ReportDialog`.
 *
 * Kept as a tiny wrapper so every surface that offers reporting — a listing, a
 * seller's shopfront, a review, a message — wires in one line and inherits the same
 * form, the same reasons and the same error handling. `label` is the noun the dialog
 * copy uses ("this listing"), so the trigger reads "Report this listing" to a screen
 * reader without the surface having to compose the sentence.
 */
export function ReportButton({
  target,
  className,
  variant = "ghost",
  children = "Report",
}: {
  target: ReportTarget;
  className?: string;
  variant?: "ghost" | "secondary" | "inset";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={`Report ${target.label ?? "content"}`}
        data-testid="report-button"
      >
        <Flag size={13} aria-hidden />
        {children}
      </Button>
      {/* Mounted only while open so the dialog's mutation hook is not created by
          merely rendering the trigger — a surface can offer reporting without a
          QueryClient in scope until the user actually decides to report. */}
      {open && <ReportDialog target={target} onOpenChange={setOpen} />}
    </>
  );
}
