import { useId } from "react";

/**
 * A bar chart, drawn from plain SVG.
 *
 * ## Why there is no chart library
 *
 * None is installed, and the prompt explicitly allows building the analytics
 * visuals from what the project already has. Adding a charting dependency for
 * one bar chart would also have meant picking its own colour defaults, its own
 * theme hook and its own bundle — while the one thing that actually matters here
 * is that the bars use `--primary` so they follow the light/dark theme like every
 * other surface in the app.
 *
 * ## Why the table is not optional
 *
 * A chart is unreadable to a screen reader, and `aria-label` on an SVG gives a
 * user nothing they can navigate. So every chart here renders a visually hidden
 * `<table>` with the same numbers, and the SVG is `aria-hidden`. A seller who
 * cannot see the chart can still read the month-by-month figures.
 *
 * ## Why the bars are `<rect>`s and not a path
 *
 * Each bar is a separate element with its own `<title>`, so hovering a bar
 * explains that bar rather than the whole series — and the zero-fill from
 * `server/lib/seller-analytics.ts` means an empty day is a zero-height bar in the
 * right position, which a line chart would hide by skipping it.
 */
export function BarChart({
  data,
  formatValue,
  label,
  emptyMessage = "Nothing in this period yet.",
}: {
  data: { label: string; value: number }[];
  formatValue: (value: number) => string;
  /** What the axis measures. Read out before the numbers. */
  label: string;
  emptyMessage?: string;
}) {
  const gradientId = useId();

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const max = Math.max(...data.map((row) => row.value), 1);

  return (
    <>
      {/* The numbers, for anyone who cannot use the picture. */}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{formatValue(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div aria-hidden className="space-y-2">
        <svg
          viewBox={`0 0 ${data.length * 24} 100`}
          preserveAspectRatio="none"
          className="h-40 w-full"
          role="presentation"
        >
          <defs>
            {/* `--color-primary`, not `--primary`. The theme block declares the
                `--color-*` family, so `--primary` resolved to nothing and the
                gradient's stops fell back to black — the chart rendered, just not in
                Revaro's orange. Naming the token that exists also means the bars
                follow the dark-mode override for free. */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          {data.map((row, index) => {
            // The bar's height comes from the same `row.value` the hidden table
            // prints, so the picture and the numbers cannot drift apart.
            const value = row.value;
            const height = (value / max) * 100;
            return (
              <rect
                key={row.label}
                x={index * 24 + 4}
                y={100 - height}
                width={16}
                height={Math.max(height, value > 0 ? 1 : 0)}
                rx={3}
                fill={`url(#${gradientId})`}
              >
                <title>{`${row.label}: ${formatValue(value)}`}</title>
              </rect>
            );
          })}
        </svg>

        <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
          <span>{data[0]?.label}</span>
          <span>{data[data.length - 1]?.label}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Peak {formatValue(max)} across {data.length} period
          {data.length === 1 ? "" : "s"}.
        </p>
      </div>
    </>
  );
}

/**
 * A two-series comparison bar — sales against rentals.
 *
 * Two bars per bucket rather than a stacked one, because the question a seller
 * asks of this chart is "which of my two businesses grew", and stacking answers
 * the total instead. It also means neither series can occlude the other, which is
 * what happens the moment one is drawn on top of the other with an unknown scale.
 */
export function SplitBarChart({
  data,
  formatValue,
  leftLabel,
  rightLabel,
}: {
  data: { label: string; left: number; right: number }[];
  formatValue: (value: number) => string;
  leftLabel: string;
  rightLabel: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing in this period yet.</p>;
  }

  const max = Math.max(...data.flatMap((row) => [row.left, row.right]), 1);

  return (
    <>
      <table className="sr-only">
        <caption>
          {leftLabel} and {rightLabel} by period
        </caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{leftLabel}</th>
            <th scope="col">{rightLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{formatValue(row.left)}</td>
              <td>{formatValue(row.right)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div aria-hidden className="space-y-2">
        <div className="flex h-40 items-end gap-1.5">
          {data.map((row) => (
            <div key={row.label} className="flex h-full flex-1 items-end justify-center gap-px">
              <div
                className="w-1/2 rounded-t-sm bg-primary/90"
                style={{ height: `${(row.left / max) * 100}%` }}
              >
                <title>{`${row.label} ${leftLabel}: ${formatValue(row.left)}`}</title>
              </div>
              <div
                className="w-1/2 rounded-t-sm bg-accent-foreground/40"
                style={{ height: `${(row.right / max) * 100}%` }}
              >
                <title>{`${row.label} ${rightLabel}: ${formatValue(row.right)}`}</title>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
          <span>{data[0]?.label}</span>
          <span>{data[data.length - 1]?.label}</span>
        </div>

        <ul className="flex gap-4 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-primary/90" aria-hidden />
            {leftLabel}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-accent-foreground/40" aria-hidden />
            {rightLabel}
          </li>
        </ul>
      </div>
    </>
  );
}
