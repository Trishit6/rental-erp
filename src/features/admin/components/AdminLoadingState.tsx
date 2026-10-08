import { Skeleton } from "@/components/ui/skeleton";

/**
 * The section-level loading state for a dashboard block.
 *
 * A skeleton rather than a whole-page spinner: the blocks around it (the overview
 * cards, the quick actions) are already on screen, so only the section that is still
 * fetching fades in. `rows` lets a caller match the shape it is about to receive —
 * a list row, a status row — without hand-writing a second skeleton.
 */
export function AdminLoadingState({ rows = 1 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3 rounded-full" />
            <Skeleton className="h-3 w-1/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}