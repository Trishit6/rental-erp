import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * One chipped filter option. Every filter group renders through this so the
 * groups stay consistent and a new filter is a data change, not new UI code.
 */
export function ChoiceChip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        selected
          ? "primary-button text-primary-foreground"
          : "soft-button text-foreground hover:text-primary",
        className,
      )}
    >
      {selected && <Check size={12} />}
      {children}
    </button>
  );
}

/** Small "Clear" affordance shown next to a filter group's title. */
export function FilterClear({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-bold text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      Clear
    </button>
  );
}

/** Shared layout for a filter group inside the sidebar or the mobile sheet. */
export function FilterGroup({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <fieldset className="border-0 p-0">
      <div className="mb-2.5 flex items-center justify-between">
        <legend className="eyebrow">{title}</legend>
        {action}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
