import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
  icon,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center gap-3 rounded-[28px] border border-border/70 p-8", className)}>
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <h3 className="font-heading text-lg font-extrabold">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {(actionLabel && (actionHref || onAction)) ? (
        actionHref ? (
          <Button asChild size="sm">
            <a href={actionHref}>{actionLabel}</a>
          </Button>
        ) : (
          <Button size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      ) : null}
    </div>
  );
}

export { EmptyState as default };
