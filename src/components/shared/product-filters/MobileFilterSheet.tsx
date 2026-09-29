import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toProductUrlSearch } from "@/lib/product-search/schema";
import type { ProductSearch } from "@/lib/product-search/types";
import { AvailabilityFilter } from "./AvailabilityFilter";
import { ConditionFilter } from "./ConditionFilter";
import { ListingTypeFilter } from "./ListingTypeFilter";
import { PriceFilter } from "./PriceFilter";
import type { FilterGroupSlot } from "./FilterPanel";

/**
 * Mobile filters. Edits a local draft so no request fires while the sheet is open —
 * "Apply filters" commits once, matching the desktop result for the same state.
 * Closing without applying discards the draft, so a screen-full of choices is never
 * silently lost mid-edit.
 */
export function MobileFilterSheet({
  open,
  onOpenChange,
  search,
  activeCount,
  onApply,
  leadGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: ProductSearch;
  /** Filter count for the given state — the sheet shows it live as the draft changes. */
  activeCount: (draft: ProductSearch) => number;
  /** Commit the draft — replaces every filter except the search term. */
  onApply: (next: ProductSearch) => void;
  leadGroup?: FilterGroupSlot;
}) {
  const [draft, setDraft] = useState<ProductSearch>(search);

  // Re-seed the draft from the live URL each time the sheet opens. Compared by a
  // stable signature so re-renders while open never loop.
  const signature = JSON.stringify(toProductUrlSearch(search));
  const [openSignature, setOpenSignature] = useState<string | null>(null);
  if (open && openSignature !== signature) {
    setOpenSignature(signature);
    setDraft(search);
  }
  if (!open && openSignature !== null) {
    setOpenSignature(null);
  }

  const patch = (next: Partial<ProductSearch>) => setDraft((current) => ({ ...current, ...next }));
  const count = activeCount(draft);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description="Narrow down what you're looking for."
      footer={
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => setDraft({ search: draft.search })}
          >
            Clear all
          </Button>
          <Button type="button" className="flex-1" onClick={() => onApply(draft)}>
            Apply filters{count > 0 ? ` (${count})` : ""}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {leadGroup?.({ search: draft, onChange: patch })}
        <ListingTypeFilter value={draft.mode} onChange={(mode) => patch({ mode })} />
        <PriceFilter
          min={draft.minPrice}
          max={draft.maxPrice}
          mode={draft.mode}
          idPrefix="product-sheet"
          onChange={(minPrice, maxPrice) => patch({ minPrice, maxPrice })}
        />
        <ConditionFilter value={draft.condition} onChange={(condition) => patch({ condition })} />
        <AvailabilityFilter
          value={draft.availability}
          onChange={(availability) => patch({ availability })}
        />
      </div>
    </Sheet>
  );
}
