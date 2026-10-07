import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardStat } from "../types";

/**
 * One statistic card. The value is a real number that journeyed from the
 * database through the API — a card never renders a fabricated figure, and
 * while its section is still loading it shows a skeleton rather than a zero.
 */
export function DashboardStatCard({
  stat,
  isLoading,
}: {
  stat: DashboardStat;
  isLoading?: boolean;
}) {
  return (
    <div className="card-surface rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
          <stat.icon size={18} aria-hidden />
        </span>
        <p className="text-right text-[11px] font-bold leading-snug text-muted-foreground">
          {stat.label}
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-8 w-16" />
      ) : (
        <p className="mt-4 font-heading text-2xl font-black tabular-nums">{stat.value}</p>
      )}

      {stat.hint && <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>}

      {stat.to && (
        <Link
          to={stat.to}
          className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
        >
          View
          <ArrowRight size={12} aria-hidden />
        </Link>
      )}
    </div>
  );
}