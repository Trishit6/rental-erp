import { cn } from "@/lib/utils/cn";
import {
  ORDER_STATUS_OPTIONS,
  RENTAL_STATUS_OPTIONS,
  statusLabel,
  type OrdersSearch,
} from "./schema";

/**
 * Status chips.
 *
 * The options come from the same constants the badge uses, so a status can never
 * be offered as a filter without also being renderable. "All" is a chip rather
 * than a separate link so clearing the filter is the same gesture as setting it.
 */
export function OrderStatusFilter({
  value,
  onChange,
  options,
  label,
  allLabel = "All",
}: {
  value: OrdersSearch["status"] | undefined;
  onChange: (status: OrdersSearch["status"] | undefined) => void;
  /** Defaults to the order lifecycle plus rental states. */
  options?: readonly { value: string; label: string }[];
  label: string;
  allLabel?: string;
}) {
  const choices = options ?? [...ORDER_STATUS_OPTIONS, ...RENTAL_STATUS_OPTIONS];

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </legend>
      {/* Horizontally scrollable on small screens so ten chips never wrap into a
          wall that pushes the results below the fold. */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={label}
      >
        <Chip selected={!value} onClick={() => onChange(undefined)}>
          {allLabel}
        </Chip>
        {choices.map((option) => (
          <Chip
            key={option.value}
            selected={value === option.value}
            onClick={() => onChange(value === option.value ? undefined : (option.value as OrdersSearch["status"]))}
          >
            {option.label ?? statusLabel(option.value)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected
          ? "primary-button text-primary-foreground"
          : "inset-surface text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
