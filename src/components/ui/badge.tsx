import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary",
        className,
      )}
      {...props}
    />
  );
}
