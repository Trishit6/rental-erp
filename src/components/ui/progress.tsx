import { cn } from "@/lib/utils/cn";

export function Progress({
  value = 0,
  max = 100,
  className,
  "aria-label": ariaLabel,
}: {
  value?: number;
  max?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={ariaLabel}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-[var(--inset-bg)]", className)}
    >
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
