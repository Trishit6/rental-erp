import { MODE_OPTIONS } from "@/lib/product-search/schema";
import type { ListingMode } from "@/lib/product-search/types";
import { ChoiceChip, FilterClear, FilterGroup } from "./ChoiceChip";

/** Rent / Buy / Rent + Buy. Same product API for every mode. */
export function ListingTypeFilter({
  value,
  onChange,
}: {
  value?: ListingMode;
  onChange: (mode?: ListingMode) => void;
}) {
  return (
    <FilterGroup
      title="Listing type"
      action={value ? <FilterClear onClick={() => onChange(undefined)} /> : undefined}
    >
      <ChoiceChip selected={!value} onClick={() => onChange(undefined)}>
        Everything
      </ChoiceChip>
      {MODE_OPTIONS.map((option) => (
        <ChoiceChip
          key={option.value}
          selected={value === option.value}
          onClick={() => onChange(value === option.value ? undefined : option.value)}
        >
          <span title={option.hint}>{option.label}</span>
        </ChoiceChip>
      ))}
    </FilterGroup>
  );
}
