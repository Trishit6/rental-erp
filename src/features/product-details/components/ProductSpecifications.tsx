import type { ProductSpecification } from "../types";

/**
 * Specification grid. Rows are built from fields the backend actually returned
 * (see `productSpecifications`) — empty values are dropped, never rendered blank.
 */
export function ProductSpecifications({ rows }: { rows: ProductSpecification[] }) {
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="specs-heading" className="space-y-3">
      <h2 id="specs-heading" className="font-heading text-lg font-extrabold">
        Specifications
      </h2>
      <dl className="inset-surface grid grid-cols-1 gap-x-6 gap-y-0 rounded-3xl px-5 py-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 border-b border-white/50 py-3 last:border-b-0 dark:border-white/5 sm:[&:nth-last-child(-n+2)]:border-b-0"
          >
            <dt className="text-xs font-semibold text-muted-foreground">{row.label}</dt>
            <dd className="text-right text-sm font-bold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
