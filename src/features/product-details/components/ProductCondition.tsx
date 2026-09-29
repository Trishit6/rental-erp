import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { conditionLabel } from "./schema";

/**
 * Condition badge. Uses the database condition vocabulary verbatim — no second
 * wording — with a text label so the state never depends on colour alone.
 */
export function ProductCondition({
  condition,
  className,
  showIcon = false,
}: {
  condition: string;
  className?: string;
  showIcon?: boolean;
}) {
  const isNew = condition === "NEW";

  return (
    <Badge
      className={cn(
        isNew ? "bg-primary/12 text-primary" : "bg-accent/15 text-accent",
        "gap-1.5",
        className,
      )}
    >
      {showIcon && isNew && <Sparkles size={12} aria-hidden />}
      {conditionLabel(condition)}
    </Badge>
  );
}
