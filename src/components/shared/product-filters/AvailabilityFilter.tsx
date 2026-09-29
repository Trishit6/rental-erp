import { AVAILABILITY_OPTIONS } from "@/lib/product-search/schema";
import type { ProductAvailability } from "@/lib/product-search/types";
import { ChoiceChip, FilterClear, FilterGroup } from "./ChoiceChip";

/**
 * Availability is derived from the stock the database actually tracks
 * (`available_quantity`), never from a guess.
 */
export function AvailabilityFilter({
  value,
  onChange,
}: {
  value?: ProductAvailability;
  onChange: (availability?: ProductAvailability) => void;
}) {
  return (
    <FilterGroup
      title="Availability"
      action={value ? <FilterClear onClick={() => onChange(undefined)} /> : undefined}
    >
      <ChoiceChip selected={!value} onClick={() => onChange(undefined)}>
        Any
      </ChoiceChip>
      {AVAILABILITY_OPTIONS.map((option) => (
        <ChoiceChip
          key={option.value}
          selected={value === option.value}
          onClick={() => onChange(value === option.value ? undefined : option.value)}
        >
          {option.label}
        </ChoiceChip>
      ))}
    </FilterGroup>
  );
}
