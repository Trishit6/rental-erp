import { CONDITION_OPTIONS } from "@/lib/product-search/schema";
import type { ConditionFilterValue } from "@/lib/product-search/types";
import { ChoiceChip, FilterClear, FilterGroup } from "./ChoiceChip";

/**
 * Condition filter. Values are the database enum plus the `pre-loved` shortcut,
 * which the API expands to every used condition — no second vocabulary.
 */
export function ConditionFilter({
  value,
  onChange,
}: {
  value?: ConditionFilterValue;
  onChange: (condition?: ConditionFilterValue) => void;
}) {
  return (
    <FilterGroup
      title="Condition"
      action={value ? <FilterClear onClick={() => onChange(undefined)} /> : undefined}
    >
      <ChoiceChip selected={!value} onClick={() => onChange(undefined)}>
        Any
      </ChoiceChip>
      {CONDITION_OPTIONS.map((option) => (
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
