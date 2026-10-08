import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The section-level error state for a dashboard block.
 *
 * One block of the dashboard failed while its neighbours succeeded, so this is a
 * contained, retryable "this bit is unavailable", never a full-page crash. The
 * message stays generic — the block's caller knows what it was fetching, and an
 * error detail string from the API is not something to render into the workspace.
 */
export function AdminErrorState({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--divider)] px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertTriangle size={15} aria-hidden className="shrink-0 text-destructive" />
        {label}
      </p>
      <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
        <RotateCcw size={13} aria-hidden />
        Retry
      </Button>
    </div>
  );
}