import { cn } from "@/lib/utils/cn";
import { RENTAL_BUCKET_OPTIONS, type RentalsSearch } from "./schema";

/**
 * The rental tabs.
 *
 * A real `tablist` with arrow-key navigation, because that is what a keyboard
 * user expects from tabs and Radix's free implementation would otherwise be
 * reimplemented badly. `All` is a tab too, so clearing the filter is the same
 * gesture as setting one.
 *
 * The buckets are `upcoming` / `active` / `completed` — the states a customer
 * actually acts on. `OVERDUE`, `RETURNED` and friends are reachable through the
 * status filter; a tab that means something slightly different to its neighbours
 * is worse than one more filter.
 */
export function RentalsTabs({
  value,
  counts,
  onChange,
}: {
  value: RentalsSearch["bucket"] | undefined;
  /** Optional per-bucket totals, when the caller has them. */
  counts?: Partial<Record<string, number>>;
  onChange: (bucket: RentalsSearch["bucket"] | undefined) => void;
}) {
  const tabs: { value: string | undefined; label: string }[] = [
    { value: undefined, label: "All" },
    ...RENTAL_BUCKET_OPTIONS.map((option) => ({
      value: option.value as string,
      label: option.label,
    })),
  ];

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.value === value);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.value as RentalsSearch["bucket"] | undefined);
    // Move focus with the selection, as the ARIA tabs pattern requires.
    const container = event.currentTarget;
    const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[(index + delta + tabs.length) % tabs.length]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Filter rentals by state"
      onKeyDown={onKeyDown}
      className="inset-surface inline-flex gap-1 rounded-full p-1"
    >
      {tabs.map((tab) => {
        const selected = value === tab.value;
        const count = tab.value === undefined ? undefined : counts?.[tab.value];
        return (
          <button
            key={tab.value ?? "all"}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value as RentalsSearch["bucket"] | undefined)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              selected
                ? "primary-button text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {count !== undefined && <span className="ml-1.5 opacity-70">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
