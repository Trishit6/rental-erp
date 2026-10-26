import { cn } from "@/lib/utils/cn";

export function StatCard({
  label,
  value,
  delta,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[24px] border border-border/70 p-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-heading text-2xl font-black">{value}</p>
        {delta ? <p className="text-xs text-muted-foreground">{delta}</p> : null}
      </div>
    </div>
  );
}
