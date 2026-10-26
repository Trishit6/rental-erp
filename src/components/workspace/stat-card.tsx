import { cn } from "@/lib/utils/cn";
import { AnimatedNumber } from "@/lib/motion/components";

export function WorkspaceStatCard({
  label,
  value,
  delta,
  className,
}: {
  label: string;
  value: number | string;
  delta?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[24px] border border-border/70 p-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-heading text-2xl font-black">
          {typeof value === "number" ? <AnimatedNumber value={value} format="integer" /> : value}
        </p>
        {delta ? <span className="text-xs text-muted-foreground">{delta}</span> : null}
      </div>
    </div>
  );
}
