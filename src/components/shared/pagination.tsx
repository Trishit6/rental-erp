import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils/cn";
import { Button } from "../ui/button";

export type PageItem = number | "gap";

/** Windowed page list, e.g. 1 … 4 5 6 … 12 */
export function buildPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const items: PageItem[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) items.push("gap");
  for (let page = left; page <= right; page += 1) items.push(page);
  if (right < total - 1) items.push("gap");
  items.push(total);

  return items;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  onPrefetch,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional: warm a page on hover/focus so the click feels instant. */
  onPrefetch?: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const items = buildPageItems(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-center gap-2 pt-2", className)}
    >
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft size={15} />
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <div className="flex items-center gap-1.5">
        {items.map((item, index) =>
          item === "gap" ? (
            <span
              key={`gap-${index}`}
              aria-hidden
              className="px-1 text-sm font-bold text-muted-foreground"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              onMouseEnter={() => onPrefetch?.(item)}
              onFocus={() => onPrefetch?.(item)}
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-200",
                item === page
                  ? "primary-button text-primary-foreground"
                  : "soft-button text-foreground hover:text-primary",
              )}
            >
              {item}
            </button>
          ),
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight size={15} />
      </Button>
    </nav>
  );
}
