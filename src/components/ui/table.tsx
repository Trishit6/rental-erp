import type { ComponentPropsWithoutRef, HTMLAttributes, ThHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Table primitives, in the shape shadcn/ui expects.
 *
 * Added because the admin catalogue is the first surface in the app that shows a
 * real data table. The styling is deliberately thin: it sets borders, spacing and
 * the header treatment, and leaves the colour to the existing design tokens, so the
 * table reads as part of Revaro rather than as a component pasted in from a
 * template.
 *
 * `Table` wraps in `overflow-x-auto` on purpose. A ten-column table cannot fit a
 * phone, and §"no horizontal page overflow" is only satisfiable if the *scroll* is
 * on the table: putting it on the page would let the whole layout scroll sideways.
 */
const Table = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("relative w-full overflow-x-auto", className)} {...props} />
  ),
);
Table.displayName = "Table";

const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <tr
    ref={ref}
    data-state={selected ? "selected" : undefined}
    className={cn(
      "border-b border-border/60 transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-11 whitespace-nowrap px-3 text-left align-middle text-xs font-extrabold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-3 py-2.5 align-middle text-sm", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

/** Horizontal scroll wrapper used for the row's action buttons. */
const TableScrollActions = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center justify-end gap-1", className)} {...props} />
  ),
);
TableScrollActions.displayName = "TableScrollActions";

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TableScrollActions,
};
