import { Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Star display for any fractional rating. The numeric value is always rendered
 * beside it by the caller, so the rating is never communicated by shape alone.
 */
export function RatingStars({
  value,
  size = 15,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const rounded = Math.round(value * 2) / 2;

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = rounded >= star;
        const half = !filled && rounded >= star - 0.5;
        return (
          <span key={star} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star size={size} className="text-muted-foreground/40" />
            {(filled || half) && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: half ? size / 2 : size }}
              >
                <Star size={size} className="fill-primary text-primary" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
