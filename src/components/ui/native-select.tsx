import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * A filter dropdown, on a native `<select>`.
 *
 * ## Why native rather than a Radix listbox
 *
 * shadcn's Select is a custom listbox: nicer on desktop, and on a phone it replaces
 * the operating system's own picker with a scrolling div — which is exactly wrong
 * for an admin catalogue that is meant to work on a small screen. A native select
 * gets the platform picker, keyboard behaviour and screen-reader semantics for
 * free, and it is styled here to match `inset-surface` so it does not look bolted
 * on.
 *
 * The admin filters are short, fixed vocabularies (status, condition, seller), so
 * none of this needs search-as-you-type.
 */
export type SelectOption = {
  value: string;
  label: string;
};

export function NativeSelect({
  label,
  options,
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  /** Visually hidden label. Required: an unlabelled select is unusable with a screen reader. */
  label: string;
  options: SelectOption[];
}) {
  return (
    <span className={cn("relative block", className)}>
      <select
        aria-label={label}
        className={cn(
          "inset-surface h-10 w-full appearance-none rounded-xl py-2 pl-3 pr-9 text-sm text-foreground outline-none transition",
          "focus-visible:ring-2 focus-visible:ring-primary/50",
          // The chevron is decorative; the value is what the control communicates.
          "[&>option]:bg-card [&>option]:text-foreground",
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
